from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection

from .activity import day_activity, provider_activity, resolve_day
from .auth import get_current_user, require_role
from .database import get_connection
from .providers import _provider_patients

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/providers")
def list_providers(
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    require_role(user, "admin")
    rows = connection.execute(
        """
        SELECT u.id, u.email, u.display_name, u.title, u.specialty, u.date_created,
               c.username, c.last_login_at,
               COUNT(a.patient_id) FILTER (WHERE a.is_deleted = false)::int AS active_patient_count
        FROM users AS u
        JOIN user_credentials AS c ON c.user_id = u.id AND c.is_deleted = false
        LEFT JOIN assignments AS a ON a.provider_id = u.id
        WHERE u.role = 'Provider' AND u.is_deleted = false
        GROUP BY u.id, c.username, c.last_login_at
        ORDER BY u.display_name
        """
    ).fetchall()
    return [
        {
            "id": str(row["id"]),
            "username": row["username"],
            "email": row["email"],
            "name": row["display_name"],
            "title": row["title"],
            "specialty": row["specialty"],
            "active_patient_count": row["active_patient_count"],
            "date_created": row["date_created"],
            "last_login_at": row["last_login_at"],
        }
        for row in rows
    ]


@router.get("/providers/{provider_id}")
def provider_detail(
    provider_id: str,
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> dict:
    require_role(user, "admin")
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
        "activity": provider_activity(connection, str(provider["id"])),
    }


@router.get("/providers/{provider_id}/activity")
def provider_day_activity(
    provider_id: str,
    date: str | None = Query(default=None, description="YYYY-MM-DD; defaults to today"),
    tz: str = Query(default="America/New_York", description="IANA time zone, e.g. America/New_York"),
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> dict:
    """What one provider did on a single day: sessions with start/end, notes written, time per client."""
    require_role(user, "admin")
    day = resolve_day(date, tz)
    exists = connection.execute(
        "SELECT 1 FROM users WHERE id = %s AND role = 'Provider' AND is_deleted = false",
        (provider_id,),
    ).fetchone()
    if not exists:
        raise HTTPException(status_code=404, detail="Provider not found.")
    return day_activity(connection, provider_id, day, tz)