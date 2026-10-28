from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection

from .activity import (
    DEFAULT_TZ,
    caseload_engagement,
    day_activity,
    provider_activity,
    resolve_day,
    validate_tz,
)
from .auth import get_current_user, require_role
from .database import get_connection

router = APIRouter(prefix="/providers", tags=["providers"])


def _provider_patients(connection: Connection, provider_id: str) -> list[dict]:
    rows = connection.execute(
        """
        SELECT p.id, p.email, p.first_name, p.last_name, p.phone, p.gender,
               p.date_of_birth,
               EXTRACT(YEAR FROM age(current_date, p.date_of_birth))::int AS age,
               latest.condition, latest.status,
               latest.onset_date AS condition_since
        FROM assignments AS a
        JOIN patients AS p ON p.id = a.patient_id AND p.is_deleted = false
        LEFT JOIN LATERAL (
            SELECT h.condition, h.status, h.onset_date
            FROM patient_medical_history AS h
            WHERE h.patient_id = p.id AND h.is_deleted = false
            ORDER BY h.date_created DESC
            LIMIT 1
        ) AS latest ON true
        WHERE a.provider_id = %s AND a.is_deleted = false
        ORDER BY p.last_name, p.first_name
        """,
        (provider_id,),
    ).fetchall()
    return [
        {
            "id": str(row["id"]),
            "name": f"{row['first_name']} {row['last_name']}".strip(),
            "email": row["email"],
            "phone": row["phone"],
            "age": row["age"],
            "gender": row["gender"],
            "condition": row["condition"],
            "diagnosis": row["condition"],
            "status": row["status"],
            "condition_since": row["condition_since"],
            "date_of_birth": row["date_of_birth"],
            "provider_id": provider_id,
        }
        for row in rows
    ]


@router.get("/{provider_id}/patients")
def get_provider_patients(
    provider_id: str,
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    require_role(user, "admin", "provider")
    if user["role"] == "provider" and user["id"] != provider_id:
        raise HTTPException(status_code=403, detail="Providers can only access their own patients.")

    provider = connection.execute(
        "SELECT id FROM users WHERE id = %s AND role = 'Provider' AND is_deleted = false",
        (provider_id,),
    ).fetchone()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found.")
    return _provider_patients(connection, provider_id)


@router.get("")
def get_provider(
    provider_id: str = Query(..., alias="providerId"),
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> dict:
    require_role(user, "admin", "provider")
    if user["role"] == "provider" and user["id"] != provider_id:
        raise HTTPException(status_code=403, detail="Providers can only access their own profile.")

    provider = connection.execute(
        """
        SELECT u.id, u.email, u.display_name, u.title, u.specialty, u.date_created,
               c.username, c.last_login_at,
               COUNT(a.patient_id) FILTER (WHERE a.is_deleted = false)::int AS active_patient_count
        FROM users AS u
        JOIN user_credentials AS c ON c.user_id = u.id AND c.is_deleted = false
        LEFT JOIN assignments AS a ON a.provider_id = u.id
        WHERE u.id = %s AND u.role = 'Provider' AND u.is_deleted = false
        GROUP BY u.id, c.username, c.last_login_at
        """,
        (provider_id,),
    ).fetchone()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found.")

    return {
        "id": str(provider["id"]),
        "username": provider["username"],
        "email": provider["email"],
        "name": provider["display_name"],
        "title": provider["title"],
        "specialty": provider["specialty"],
        "active_patient_count": provider["active_patient_count"],
        "date_created": provider["date_created"],
        "last_login_at": provider["last_login_at"],
        "patients": _provider_patients(connection, str(provider["id"])),
    }


def _check_provider_access(connection: Connection, user: dict[str, str], provider_id: str) -> None:
    """Admins may look at any provider; a provider only at themselves."""
    require_role(user, "admin", "provider")
    if user["role"] == "provider" and user["id"] != provider_id:
        raise HTTPException(status_code=403, detail="Providers can only access their own activity.")
    exists = connection.execute(
        "SELECT 1 FROM users WHERE id = %s AND role = 'Provider' AND is_deleted = false",
        (provider_id,),
    ).fetchone()
    if not exists:
        raise HTTPException(status_code=404, detail="Provider not found.")


@router.get("/{provider_id}/activity")
def get_provider_activity(
    provider_id: str,
    date: str | None = Query(default=None, description="YYYY-MM-DD; defaults to today"),
    tz: str = Query(default=DEFAULT_TZ, description="IANA time zone, e.g. America/New_York"),
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> dict:
    """A provider's own time log: the last 30 days per client, plus one day in detail."""
    _check_provider_access(connection, user, provider_id)
    day = resolve_day(date, tz)
    return {
        "period": provider_activity(connection, provider_id),
        "day": day_activity(connection, provider_id, day, tz),
    }


@router.get("/{provider_id}/engagement")
def get_caseload_engagement(
    provider_id: str,
    days: int = Query(default=30, ge=7, le=90),
    tz: str = Query(default=DEFAULT_TZ, description="IANA time zone, e.g. America/New_York"),
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> dict:
    """How this provider's clients use the apps: modules, time of day, trend and who has gone quiet."""
    _check_provider_access(connection, user, provider_id)
    validate_tz(tz)
    return caseload_engagement(connection, provider_id, days, tz)