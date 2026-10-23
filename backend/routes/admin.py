from datetime import date as date_type
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection

from .auth import get_current_user, require_role
from .database import get_connection
from .providers import _provider_patients

router = APIRouter(prefix="/admin", tags=["admin"])

ACTIVITY_WINDOW_DAYS = 30
RTM_TARGET_MINUTES = 20  # placeholder until PTI confirms the real threshold


def _provider_activity(connection: Connection, provider_id: str) -> dict:
    """What a provider did in the last 30 days: time per client, totals and a recent feed."""
    per_patient = connection.execute(
        """
        SELECT p.id, p.first_name, p.last_name,
               COALESCE(e.status, 'NotEnrolled') AS rtm_status,
               COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (r.ended_at - r.started_at)) / 60)
                   FILTER (WHERE r.activity_type = 'Review')), 0)::int AS review_minutes,
               COUNT(r.id) FILTER (WHERE r.activity_type = 'Review')::int AS review_count,
               COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (r.ended_at - r.started_at)) / 60)
                   FILTER (WHERE r.activity_type = 'ManagementTime')), 0)::int AS management_minutes,
               COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (r.ended_at - r.started_at)) / 60)
                   FILTER (WHERE r.activity_type = 'Communication')), 0)::int AS communication_minutes,
               COUNT(r.id) FILTER (WHERE r.activity_type = 'Communication')::int AS communication_count,
               MAX(r.started_at) AS last_activity_at
        FROM assignments AS a
        JOIN patients AS p ON p.id = a.patient_id AND p.is_deleted = false
        LEFT JOIN rtm_enrollments AS e ON e.patient_id = p.id AND e.is_deleted = false
        LEFT JOIN rtm_activities AS r
               ON r.patient_id = p.id AND r.provider_id = a.provider_id AND r.is_deleted = false
              AND r.started_at >= now() - make_interval(days => %s)
        WHERE a.provider_id = %s AND a.is_deleted = false
        GROUP BY p.id, p.first_name, p.last_name, e.status
        ORDER BY p.last_name, p.first_name
        """,
        (ACTIVITY_WINDOW_DAYS, provider_id),
    ).fetchall()

    therapy = {
        str(row["patient_id"]): row
        for row in connection.execute(
            """
            SELECT patient_id, COUNT(*)::int AS session_count,
                   COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)), 0)::int AS minutes
            FROM clinical_sessions
            WHERE provider_id = %s AND is_deleted = false
              AND started_at >= now() - make_interval(days => %s)
            GROUP BY patient_id
            """,
            (provider_id, ACTIVITY_WINDOW_DAYS),
        ).fetchall()
    }

    notes_written = connection.execute(
        """
        SELECT COUNT(*)::int AS count FROM provider_notes
        WHERE provider_id = %s AND is_deleted = false
          AND date_created >= now() - make_interval(days => %s)
        """,
        (provider_id, ACTIVITY_WINDOW_DAYS),
    ).fetchone()["count"]

    recent = connection.execute(
        """
        SELECT r.id, r.activity_type, r.direction, r.channel, r.summary, r.started_at,
               ROUND(EXTRACT(EPOCH FROM (r.ended_at - r.started_at)) / 60)::int AS minutes,
               p.id AS patient_id, p.first_name, p.last_name
        FROM rtm_activities AS r
        JOIN patients AS p ON p.id = r.patient_id
        WHERE r.provider_id = %s AND r.is_deleted = false
          AND r.started_at >= now() - make_interval(days => %s)
        ORDER BY r.started_at DESC
        LIMIT 15
        """,
        (provider_id, ACTIVITY_WINDOW_DAYS),
    ).fetchall()

    clients = []
    for row in per_patient:
        session = therapy.get(str(row["id"]))
        rtm_minutes = row["review_minutes"] + row["management_minutes"] + row["communication_minutes"]
        clients.append(
            {
                "patient_id": str(row["id"]),
                "name": f"{row['first_name']} {row['last_name']}".strip(),
                "rtm_status": row["rtm_status"],
                "review_count": row["review_count"],
                "review_minutes": row["review_minutes"],
                "management_minutes": row["management_minutes"],
                "communication_count": row["communication_count"],
                "communication_minutes": row["communication_minutes"],
                "rtm_minutes": rtm_minutes,
                "target_met": rtm_minutes >= RTM_TARGET_MINUTES,
                "therapy_sessions": session["session_count"] if session else 0,
                "therapy_minutes": session["minutes"] if session else 0,
                "last_activity_at": row["last_activity_at"],
            }
        )

    enrolled = [c for c in clients if c["rtm_status"] == "Enrolled"]
    return {
        "window_days": ACTIVITY_WINDOW_DAYS,
        "target_minutes": RTM_TARGET_MINUTES,
        "totals": {
            "review_minutes": sum(c["review_minutes"] for c in clients),
            "management_minutes": sum(c["management_minutes"] for c in clients),
            "communication_minutes": sum(c["communication_minutes"] for c in clients),
            "rtm_minutes": sum(c["rtm_minutes"] for c in clients),
            "therapy_sessions": sum(c["therapy_sessions"] for c in clients),
            "notes_written": notes_written,
            "enrolled_clients": len(enrolled),
            "enrolled_meeting_target": sum(1 for c in enrolled if c["target_met"]),
        },
        "clients": clients,
        "recent": [
            {
                "id": str(row["id"]),
                "activity_type": row["activity_type"],
                "direction": row["direction"],
                "channel": row["channel"],
                "summary": row["summary"],
                "started_at": row["started_at"],
                "minutes": row["minutes"],
                "patient_id": str(row["patient_id"]),
                "patient_name": f"{row['first_name']} {row['last_name']}".strip(),
            }
            for row in recent
        ],
    }


def _resolve_day(day: str | None, tz_name: str) -> str:
    """Validate the time zone and the date (YYYY-MM-DD); default to today in that zone."""
    try:
        zone = ZoneInfo(tz_name)
    except Exception as error:  # unknown or malformed zone name
        raise HTTPException(status_code=400, detail="Unknown time zone.") from error
    if day:
        try:
            date_type.fromisoformat(day)
        except ValueError as error:
            raise HTTPException(status_code=400, detail="date must be formatted as YYYY-MM-DD.") from error
        return day
    return datetime.now(zone).date().isoformat()


def _day_activity(connection: Connection, provider_id: str, day: str, tz_name: str) -> dict:
    """One calendar day (in the viewer's time zone): therapy sessions, notes and time spent per client.

    Counts and names only. Note text is deliberately not returned to admins."""
    params = {"provider": provider_id, "day": day, "tz": tz_name}
    window = """
        ((%(day)s::date)::timestamp AT TIME ZONE %(tz)s)
        """
    window_end = """
        ((%(day)s::date + 1)::timestamp AT TIME ZONE %(tz)s)
        """

    sessions = connection.execute(
        f"""
        SELECT cs.id, cs.mode, cs.started_at, cs.ended_at,
               ROUND(EXTRACT(EPOCH FROM (cs.ended_at - cs.started_at)) / 60)::int AS minutes,
               CASE WHEN cs.ended_at <= now() THEN 'Completed'
                    WHEN cs.started_at <= now() THEN 'In progress'
                    ELSE 'Upcoming' END AS status,
               p.id AS patient_id, p.first_name, p.last_name
        FROM clinical_sessions AS cs
        JOIN patients AS p ON p.id = cs.patient_id
        WHERE cs.provider_id = %(provider)s AND cs.is_deleted = false
          AND cs.started_at >= {window} AND cs.started_at < {window_end}
        ORDER BY cs.started_at
        """,
        params,
    ).fetchall()

    notes = connection.execute(
        f"""
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE note_type = 'SessionNote')::int AS session_notes,
               COUNT(*) FILTER (WHERE note_type = 'TrendLog')::int AS trend_logs
        FROM provider_notes
        WHERE provider_id = %(provider)s AND is_deleted = false
          AND date_created >= {window} AND date_created < {window_end}
        """,
        params,
    ).fetchone()

    time_per_client = connection.execute(
        f"""
        SELECT p.id, p.first_name, p.last_name,
               COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (r.ended_at - r.started_at)) / 60)
                   FILTER (WHERE r.activity_type = 'Review')), 0)::int AS review_minutes,
               COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (r.ended_at - r.started_at)) / 60)
                   FILTER (WHERE r.activity_type = 'ManagementTime')), 0)::int AS management_minutes,
               COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (r.ended_at - r.started_at)) / 60)
                   FILTER (WHERE r.activity_type = 'Communication')), 0)::int AS communication_minutes,
               COUNT(r.id) FILTER (WHERE r.activity_type = 'Communication')::int AS communications
        FROM rtm_activities AS r
        JOIN patients AS p ON p.id = r.patient_id
        WHERE r.provider_id = %(provider)s AND r.is_deleted = false
          AND r.started_at >= {window} AND r.started_at < {window_end}
        GROUP BY p.id, p.first_name, p.last_name
        ORDER BY p.last_name, p.first_name
        """,
        params,
    ).fetchall()

    met = [row for row in sessions if row["status"] != "Upcoming"]
    return {
        "date": day,
        "timezone": tz_name,
        "summary": {
            "sessions_total": len(sessions),
            "sessions_completed": sum(1 for row in sessions if row["status"] == "Completed"),
            "patients_met": len({str(row["patient_id"]) for row in met}),
            "therapy_minutes": sum(row["minutes"] for row in met),
            "notes_written": notes["total"],
            "session_notes": notes["session_notes"],
            "trend_logs": notes["trend_logs"],
            "review_minutes": sum(row["review_minutes"] for row in time_per_client),
            "management_minutes": sum(row["management_minutes"] for row in time_per_client),
            "communications": sum(row["communications"] for row in time_per_client),
        },
        "sessions": [
            {
                "id": str(row["id"]),
                "patient_id": str(row["patient_id"]),
                "patient_name": f"{row['first_name']} {row['last_name']}".strip(),
                "mode": row["mode"],
                "status": row["status"],
                "started_at": row["started_at"],
                "ended_at": row["ended_at"],
                "minutes": row["minutes"],
            }
            for row in sessions
        ],
        "time_per_client": [
            {
                "patient_id": str(row["id"]),
                "patient_name": f"{row['first_name']} {row['last_name']}".strip(),
                "review_minutes": row["review_minutes"],
                "management_minutes": row["management_minutes"],
                "communication_minutes": row["communication_minutes"],
                "communications": row["communications"],
            }
            for row in time_per_client
        ],
    }


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
        "activity": _provider_activity(connection, str(provider["id"])),
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
    day = _resolve_day(date, tz)
    exists = connection.execute(
        "SELECT 1 FROM users WHERE id = %s AND role = 'Provider' AND is_deleted = false",
        (provider_id,),
    ).fetchone()
    if not exists:
        raise HTTPException(status_code=404, detail="Provider not found.")
    return _day_activity(connection, provider_id, day, tz)