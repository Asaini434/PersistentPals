import os
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

import bcrypt
import jwt
import psycopg
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, model_validator
from psycopg import Connection

from .database import get_connection

router = APIRouter(prefix="/auth", tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)

TOKEN_LIFETIME_HOURS = 8
KEYS_DIR = Path(__file__).resolve().parent.parent / "keys"


@lru_cache(maxsize=1)
def _signing_config() -> dict[str, str] | None:
    """How login tokens are signed and checked.

    Preferred: an RSA key pair (RS256). The private key signs tokens at login; only the public key
    is needed to check them, so a leaked verifier cannot forge tokens. Create the pair with the
    openssl commands in the README (keys land in backend/keys/, which git ignores).

    Fallback for older setups: a shared secret (HS256). The algorithm is fixed here and never read from
    the token header, so a forged header cannot downgrade the check.
    """
    private_path = Path(os.getenv("JWT_PRIVATE_KEY_PATH") or KEYS_DIR / "jwt_private.pem")
    public_path = Path(os.getenv("JWT_PUBLIC_KEY_PATH") or KEYS_DIR / "jwt_public.pem")
    if private_path.is_file() and public_path.is_file():
        return {
            "algorithm": "RS256",
            "sign_key": private_path.read_text(),
            "verify_key": public_path.read_text(),
        }
    secret = os.getenv("JWT_SECRET")
    if secret:
        return {"algorithm": "HS256", "sign_key": secret, "verify_key": secret}
    return None


def signing_algorithm() -> str | None:
    """Name of the algorithm in use ('RS256' or 'HS256'), or None when auth is not configured."""
    config = _signing_config()
    return config["algorithm"] if config else None


def _require_signing_config() -> dict[str, str]:
    config = _signing_config()
    if config is None:
        raise HTTPException(status_code=503, detail="Authentication service is not configured.")
    return config


class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=1024)
    username: str | None = Field(default=None, min_length=1, max_length=320)
    email: str | None = Field(default=None, min_length=3, max_length=320)

    @model_validator(mode="after")
    def require_login_identifier(self):
        if not (self.username or self.email):
            raise ValueError("Provide a username or email.")
        return self


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, str]:
    config = _require_signing_config()
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Bearer token is required.")

    try:
        claims = jwt.decode(
            credentials.credentials,
            config["verify_key"],
            algorithms=[config["algorithm"]],
            options={"require": ["exp", "sub", "role"]},
        )
    except jwt.InvalidTokenError as error:
        raise HTTPException(status_code=401, detail="Invalid or expired token.") from error

    return {"id": claims["sub"], "role": claims["role"]}


def require_role(user: dict[str, str], *roles: str) -> None:
    if user["role"] not in roles:
        raise HTTPException(status_code=403, detail="You are not authorized to access this resource.")


@router.post("/login")
def login(
    credentials: LoginRequest,
    connection: Connection = Depends(get_connection),
) -> dict[str, object]:
    config = _require_signing_config()

    identifier = (credentials.username or credentials.email or "").strip().lower()
    account = connection.execute(
        """
        SELECT u.id, u.email, u.display_name, u.title, u.specialty, u.role,
               c.username, c.password_hash
        FROM users AS u
        JOIN user_credentials AS c ON c.user_id = u.id
        WHERE (lower(c.username) = %s OR lower(u.email) = %s)
          AND u.is_deleted = false
          AND c.is_deleted = false
        """,
        (identifier, identifier),
    ).fetchone()

    password_matches = False
    if account:
        try:
            password_matches = bcrypt.checkpw(
                credentials.password.encode("utf-8"),
                account["password_hash"].encode("utf-8"),
            )
        except (ValueError, TypeError):
            password_matches = False

    if not account or not password_matches:
        raise HTTPException(status_code=401, detail="Invalid username/email or password.")

    connection.execute(
        "UPDATE user_credentials SET last_login_at = now() WHERE user_id = %s",
        (account["id"],),
    )
    user = {
        "id": str(account["id"]),
        "username": account["username"],
        "email": account["email"],
        "name": account["display_name"],
        "title": account["title"],
        "specialty": account["specialty"],
        "role": account["role"].lower(),
    }
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": user["id"],
            "role": user["role"],
            "iat": now,
            "exp": now + timedelta(hours=TOKEN_LIFETIME_HOURS),
        },
        config["sign_key"],
        algorithm=config["algorithm"],
    )
    return {"user": user, "access_token": token, "token_type": "bearer"}


@router.get("/me")
def current_user(user: dict[str, str] = Depends(get_current_user)) -> dict[str, str]:
    return user