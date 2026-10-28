"""Shared activity queries: what providers did, and how their clients use the Reflect apps.

Kept apart from the route files so the admin, provider and patient routes can all use them.
Everything here returns counts, names and times only; note text never leaves this module."""
from datetime import date as date_type
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from psycopg import Connection

ACTIVITY_WINDOW_DAYS = 30
RTM_TARGET_MINUTES = 20  # placeholder until PTI confirms the real threshold


def provider_activity(connection: Connection, provider_id: str) -> dict:
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


def resolve_day(day: str | None, tz_name: str) -> str:
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


def day_activity(connection: Connection, provider_id: str, day: str, tz_name: str) -> dict:
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


# ---------------------------------------------------------------------------
# Client app usage (Reflect XR / Reflect Mobile sessions)
# ---------------------------------------------------------------------------

DEFAULT_TZ = "America/New_York"


def validate_tz(tz_name: str) -> None:
    try:
        ZoneInfo(tz_name)
    except Exception as error:  # unknown or malformed zone name
        raise HTTPException(status_code=400, detail="Unknown time zone.") from error


# "Last N local days, including today" as a timestamptz, in the viewer's time zone
_WINDOW_START = (
    "(((now() AT TIME ZONE %(tz)s)::date - (%(days)s::int - 1))::timestamp AT TIME ZONE %(tz)s)"
)
_MINUTES = "COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 60)), 0)::int"


def _usage_rollups(connection: Connection, scope: str, params: dict, days: int) -> dict:
    """Module, program, platform, hour-of-day and per-day rollups for the sessions picked by `scope`.

    `scope` is a fixed SQL fragment written in this file (never user input) that filters sessions alias `s`."""
    query_params = {**params, "days": days}
    in_window = f"s.is_deleted = false AND s.started_at >= {_WINDOW_START}"

    by_module = connection.execute(
        f"""
        SELECT m.id, m.name, m.platform, m.program, m.uses_ai,
               COUNT(*)::int AS sessions,
               COUNT(DISTINCT s.patient_id)::int AS clients,
               {_MINUTES} AS minutes
        FROM sessions AS s
        JOIN modules AS m ON m.id = s.module_id
        WHERE {scope} AND {in_window}
        GROUP BY m.id, m.name, m.platform, m.program, m.uses_ai
        ORDER BY sessions DESC, minutes DESC, m.name
        """,
        query_params,
    ).fetchall()

    hour_rows = connection.execute(
        f"""
        SELECT EXTRACT(HOUR FROM s.started_at AT TIME ZONE %(tz)s)::int AS hour, COUNT(*)::int AS sessions
        FROM sessions AS s
        WHERE {scope} AND {in_window}
        GROUP BY 1
        """,
        query_params,
    ).fetchall()
    by_hour = [0] * 24
    for row in hour_rows:
        by_hour[row["hour"]] = row["sessions"]

    daily = connection.execute(
        f"""
        SELECT d.day,
               COUNT(s.id)::int AS sessions,
               COUNT(DISTINCT s.patient_id)::int AS clients,
               {_MINUTES} AS minutes
        FROM generate_series(
                 ((now() AT TIME ZONE %(tz)s)::date - (%(days)s::int - 1))::timestamp,
                 (now() AT TIME ZONE %(tz)s)::date::timestamp,
                 interval '1 day') AS g(day_ts)
        CROSS JOIN LATERAL (SELECT g.day_ts::date AS day) AS d
        LEFT JOIN sessions AS s
               ON {scope} AND s.is_deleted = false
              AND (s.started_at AT TIME ZONE %(tz)s)::date = d.day
        GROUP BY d.day
        ORDER BY d.day
        """,
        query_params,
    ).fetchall()

    modules = [{**row, "id": str(row["id"])} for row in by_module]

    programs: dict[tuple[str, str], dict] = {}
    platforms: dict[str, dict] = {}
    for row in modules:
        key = (row["platform"], row["program"])
        entry = programs.setdefault(key, {"platform": row["platform"], "program": row["program"], "sessions": 0, "minutes": 0})
        entry["sessions"] += row["sessions"]
        entry["minutes"] += row["minutes"]
        plat = platforms.setdefault(row["platform"], {"platform": row["platform"], "sessions": 0, "minutes": 0})
        plat["sessions"] += row["sessions"]
        plat["minutes"] += row["minutes"]

    return {
        "window_days": days,
        "timezone": params["tz"],
        "daily": daily,
        "by_module": modules,
        "by_program": sorted(programs.values(), key=lambda r: (-r["sessions"], r["program"])),
        "by_platform": sorted(platforms.values(), key=lambda r: -r["sessions"]),
        "by_hour": by_hour,
        "total_sessions": sum(row["sessions"] for row in modules),
        "total_minutes": sum(row["minutes"] for row in modules),
        "active_days": sum(1 for row in daily if row["sessions"]),
    }


def client_app_activity(connection: Connection, patient_id: str, days: int, tz_name: str) -> dict:
    """One client's app usage: per-day trend, modules, time of day and mood after sessions."""
    params = {"patient": patient_id, "tz": tz_name}
    usage = _usage_rollups(connection, "s.patient_id = %(patient)s", params, days)

    recency = connection.execute(
        """
        SELECT MAX(s.started_at) AS last_active_at,
               (now() AT TIME ZONE %(tz)s)::date - (MAX(s.started_at) AT TIME ZONE %(tz)s)::date AS days_since_last,
               COUNT(*) FILTER (WHERE s.started_at >= now() - interval '7 days')::int AS sessions_last_7,
               COUNT(*) FILTER (WHERE s.started_at >= now() - interval '14 days'
                                  AND s.started_at <  now() - interval '7 days')::int AS sessions_prev_7
        FROM sessions AS s
        WHERE s.patient_id = %(patient)s AND s.is_deleted = false
        """,
        params,
    ).fetchone()

    mood = connection.execute(
        f"""
        SELECT r.recorded_at, r.mood_score
        FROM response_entries AS r
        WHERE r.patient_id = %(patient)s AND r.is_deleted = false
          AND r.recorded_at >= {_WINDOW_START}
        ORDER BY r.recorded_at
        """,
        {**params, "days": days},
    ).fetchall()

    sessions = usage["total_sessions"]
    return {
        "window_days": days,
        "timezone": tz_name,
        "summary": {
            "sessions": sessions,
            "minutes": usage["total_minutes"],
            "active_days": usage["active_days"],
            "avg_minutes": round(usage["total_minutes"] / sessions) if sessions else 0,
            "last_active_at": recency["last_active_at"],
            "days_since_last": recency["days_since_last"],
            "sessions_last_7": recency["sessions_last_7"],
            "sessions_prev_7": recency["sessions_prev_7"],
            "avg_mood": round(sum(r["mood_score"] for r in mood) / len(mood), 1) if mood else None,
        },
        "daily": usage["daily"],
        "by_module": usage["by_module"],
        "by_program": usage["by_program"],
        "by_platform": usage["by_platform"],
        "by_hour": usage["by_hour"],
        "mood": mood,
    }


def _engagement_status(last_active_at, days_since_last, last_7: int, prev_7: int) -> str:
    if last_active_at is None:
        return "No activity"
    if days_since_last is not None and days_since_last >= 7:
        return "Inactive"
    if prev_7 and last_7 <= prev_7 * 0.6:
        return "Less active"
    if last_7 > prev_7 and last_7 >= prev_7 * 1.4:
        return "More active"
    return "Steady"


def caseload_engagement(connection: Connection, provider_id: str, days: int, tz_name: str) -> dict:
    """App usage across one provider's assigned clients: what they use, when, and who has gone quiet."""
    params = {"provider": provider_id, "tz": tz_name}
    scope = """s.patient_id IN (
            SELECT a.patient_id FROM assignments AS a
            JOIN patients AS p ON p.id = a.patient_id AND p.is_deleted = false
            WHERE a.provider_id = %(provider)s AND a.is_deleted = false)"""
    usage = _usage_rollups(connection, scope, params, days)

    clients = connection.execute(
        f"""
        SELECT p.id, p.first_name, p.last_name,
               COUNT(s.id) FILTER (WHERE s.started_at >= {_WINDOW_START})::int AS sessions,
               COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 60)
                   FILTER (WHERE s.started_at >= {_WINDOW_START})), 0)::int AS minutes,
               MAX(s.started_at) AS last_active_at,
               (now() AT TIME ZONE %(tz)s)::date - (MAX(s.started_at) AT TIME ZONE %(tz)s)::date AS days_since_last,
               COUNT(s.id) FILTER (WHERE s.started_at >= now() - interval '7 days')::int AS sessions_last_7,
               COUNT(s.id) FILTER (WHERE s.started_at >= now() - interval '14 days'
                                     AND s.started_at <  now() - interval '7 days')::int AS sessions_prev_7,
               (SELECT r.mood_score FROM response_entries AS r
                 WHERE r.patient_id = p.id AND r.is_deleted = false
                 ORDER BY r.recorded_at DESC LIMIT 1) AS latest_mood
        FROM assignments AS a
        JOIN patients AS p ON p.id = a.patient_id AND p.is_deleted = false
        LEFT JOIN sessions AS s ON s.patient_id = p.id AND s.is_deleted = false
        WHERE a.provider_id = %(provider)s AND a.is_deleted = false
        GROUP BY p.id, p.first_name, p.last_name
        ORDER BY p.last_name, p.first_name
        """,
        {**params, "days": days},
    ).fetchall()

    client_rows = []
    for row in clients:
        client_rows.append(
            {
                "patient_id": str(row["id"]),
                "name": f"{row['first_name']} {row['last_name']}".strip(),
                "sessions": row["sessions"],
                "minutes": row["minutes"],
                "last_active_at": row["last_active_at"],
                "days_since_last": row["days_since_last"],
                "sessions_last_7": row["sessions_last_7"],
                "sessions_prev_7": row["sessions_prev_7"],
                "latest_mood": row["latest_mood"],
                "status": _engagement_status(
                    row["last_active_at"], row["days_since_last"], row["sessions_last_7"], row["sessions_prev_7"]
                ),
            }
        )

    return {
        "window_days": days,
        "timezone": tz_name,
        "summary": {
            "clients": len(client_rows),
            "active_clients": sum(1 for c in client_rows if c["sessions"] > 0),
            "needs_attention": sum(1 for c in client_rows if c["status"] in ("Inactive", "No activity")),
            "sessions": usage["total_sessions"],
            "minutes": usage["total_minutes"],
        },
        "daily": usage["daily"],
        "by_module": usage["by_module"],
        "by_program": usage["by_program"],
        "by_platform": usage["by_platform"],
        "by_hour": usage["by_hour"],
        "clients": client_rows,
    }