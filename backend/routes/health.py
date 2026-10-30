"""Health check, plus the HIPAA-readiness self-assessment shown on the Home page.

The readiness score is a team checklist, NOT a compliance certification. Items marked "live" are checked against
the running system each time; the rest are statements about the design that the team keeps up to date by hand.
"""
import os

from fastapi import APIRouter, Depends
from psycopg import Connection

from .auth import TOKEN_LIFETIME_HOURS, get_current_user, signing_algorithm
from .database import get_connection

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


MET, PARTIAL, PLANNED = "met", "partial", "planned"
CREDIT = {MET: 1.0, PARTIAL: 0.5, PLANNED: 0.0}

DISCLAIMER = (
    "Readiness self-assessment for this prototype, not a HIPAA compliance certification. "
    "Items marked live are checked against the running system; the others describe the design "
    "and are maintained by the team."
)


def _item(key, pillar, title, status, detail, live=False, reference=None):
    return {"key": key, "pillar": pillar, "title": title, "status": status,
            "detail": detail, "live": live, "reference": reference}


def build_checks(connection: Connection) -> list[dict]:
    algorithm = signing_algorithm()
    if algorithm == "RS256":
        signature = _item("digital_signature", "Integrity", "Digitally signed login tokens", MET,
                          "Tokens are signed with an RSA private key (RS256) and checked with the public key, "
                          "so a changed role or user id is rejected.", True, "164.312(c)(1), 164.312(d)")
    elif algorithm == "HS256":
        signature = _item("digital_signature", "Integrity", "Digitally signed login tokens", PARTIAL,
                          "Tokens use a shared-secret signature (HS256). Create an RSA key pair "
                          "(see the README) to switch to RS256.", True, "164.312(c)(1), 164.312(d)")
    else:
        signature = _item("digital_signature", "Integrity", "Digitally signed login tokens", PLANNED,
                          "No signing key is configured, so login is disabled.", True, "164.312(c)(1), 164.312(d)")

    soft_delete_tables = connection.execute(
        "SELECT count(DISTINCT table_name) AS n FROM information_schema.columns "
        "WHERE table_schema = 'public' AND column_name = 'is_deleted'"
    ).fetchone()["n"]
    audit_rows = connection.execute("SELECT count(*) AS n FROM audit_log").fetchone()["n"]

    db_url = os.getenv("DATABASE_URL", "")
    db_tls = "sslmode=require" in db_url or "sslmode=verify" in db_url
    external_phi = os.getenv("CHATBOT_ALLOW_EXTERNAL_PHI", "false").casefold() == "true"

    return [
        _item("rbac", "Confidentiality", "Role-based access control", MET,
              "Admin, provider and client roles are enforced on the server; a provider can open only "
              "assigned clients.", False, "164.312(a)(1)"),
        _item("password_hashing", "Confidentiality", "Passwords stored as bcrypt hashes", MET,
              "Plain-text passwords are never stored.", False, "164.312(d)"),
        _item("local_ai", "Confidentiality", "AI assistant keeps data local", MET if not external_phi else PARTIAL,
              "The chat model runs locally; sending data to an outside model is switched off."
              if not external_phi else "Outside model use is switched ON. Needs approval and a BAA.",
              True, "164.502(e)"),
        _item("session_expiry", "Confidentiality", "Login sessions expire", MET,
              f"Tokens expire after {TOKEN_LIFETIME_HOURS} hours.", True, "164.312(a)(2)(iii)"),
        signature,
        _item("constraints", "Integrity", "Database constraints and foreign keys", MET,
              "CHECK and FK constraints keep records valid and linked.", False, "164.312(c)(1)"),
        _item("soft_delete", "Resilience", "Soft delete instead of permanent delete",
              MET if soft_delete_tables >= 5 else PARTIAL,
              f"{soft_delete_tables} tables keep removed rows flagged rather than erased.", True, "164.308(a)(7)"),
        _item("backups", "Resilience", "Scheduled database backups", PLANNED,
              "Not set up yet. Needed before any real data.", False, "164.308(a)(7)(ii)(A)"),
        _item("audit_log", "Accountability", "Audit trail of record changes",
              PARTIAL if audit_rows else PLANNED,
              f"Notes and communication entries are logged ({audit_rows} entries). Reads and logins are not logged yet.",
              True, "164.312(b)"),
        _item("db_tls", "Transmission", "Encrypted database connection", MET if db_tls else PLANNED,
              "Database connection requires TLS." if db_tls else
              "Local development uses an unencrypted connection. Production needs sslmode=require.",
              True, "164.312(e)(1)"),
        _item("https", "Transmission", "HTTPS between browser and server", PLANNED,
              "Needed in deployment (TLS certificate on the host).", False, "164.312(e)(1)"),
        _item("mfa", "Access", "Multi-factor login", PLANNED, "Not built yet.", False, "164.312(d)"),
        _item("rate_limit", "Access", "Login attempt limits", PLANNED, "Not built yet.", False, "164.312(d)"),
        _item("baa", "Administrative", "Business associate agreements", PLANNED,
              "Needed with any hosting or AI vendor before real PHI. Not a code item.", False, "164.308(b)(1)"),
        _item("synthetic_data", "Administrative", "Demo uses synthetic data only", MET,
              "No real client information is in this prototype.", False, None),
    ]


def summarize(checks: list[dict]) -> dict:
    total = len(checks)
    score = round(100 * sum(CREDIT[c["status"]] for c in checks) / total) if total else 0
    pillars: dict[str, dict] = {}
    for c in checks:
        p = pillars.setdefault(c["pillar"], {"pillar": c["pillar"], "met": 0, "partial": 0, "planned": 0})
        p[c["status"]] += 1
    return {"score": score, "total": total,
            "met": sum(c["status"] == MET for c in checks),
            "partial": sum(c["status"] == PARTIAL for c in checks),
            "planned": sum(c["status"] == PLANNED for c in checks),
            "pillars": list(pillars.values())}


@router.get("/security/readiness")
def readiness(user: dict = Depends(get_current_user), connection: Connection = Depends(get_connection)) -> dict:
    checks = build_checks(connection)
    return {**summarize(checks), "checks": checks, "disclaimer": DISCLAIMER}