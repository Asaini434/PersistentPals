import os
from datetime import datetime, timedelta, timezone

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
    jwt_secret = os.getenv("JWT_SECRET")
    if not jwt_secret:
        raise HTTPException(status_code=503, detail="Authentication service is not configured.")
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Bearer token is required.")

    try:
        claims = jwt.decode(credentials.credentials, jwt_secret, algorithms=["HS256"])
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
    jwt_secret = os.getenv("JWT_SECRET")
    if not jwt_secret:
        raise HTTPException(status_code=503, detail="Authentication service is not configured.")

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
            "exp": now + timedelta(hours=8),
        },
        jwt_secret,
        algorithm="HS256",
    )
    return {"user": user, "access_token": token, "token_type": "bearer"}


@router.get("/me")
def current_user(user: dict[str, str] = Depends(get_current_user)) -> dict[str, str]:
    return user