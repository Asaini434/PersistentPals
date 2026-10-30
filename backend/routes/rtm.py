"""Remote Therapeutic Monitoring (RTM): enrollment and consent, the 30-day monitoring-status view,
documentation status, and provider review / management time.

RTM is treated as a clinical workflow, not an analytics chart: every number here comes from records the
provider can open, and every change is written to the audit trail.

Assumptions to confirm with PTI / a billing specialist before real use:
  * RTM_QUALIFYING_DAYS: days with app data needed in a 30-day period. 16 is the figure commonly quoted
    for RTM device-supply billing, but treat it as unverified here.
  * "Provider management time" = all time a provider logged for the client in the period
    (reviews + communications + other management).
"""
from datetime import date as date_type
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection
from pydantic import BaseModel, Field, field_validator

from .activity import DEFAULT_TZ, validate_tz
from .auth import get_current_user, require_role
from .database import get_connection

router = APIRouter(tags=["rtm"])

PERIOD_DAYS = 30
RTM_QUALIFYING_DAYS = 16
DOC_STATUSES = ("NotStarted", "InProgress", "Complete")


# ---------------------------------------------------------------------------
# Queries (plain functions so they can be tested without the web layer)
# ---------------------------------------------------------------------------


def _enrollment(connection: Connection, patient_id: str) -> dict:
    row = connection.execute(
        """
        SELECT status, consent_given, consent_date, enrolled_on, notes, date_updated
        FROM rtm_enrollments
        WHERE patient_id = %s AND is_deleted = false
        """,
        (patient_id,),
    ).fetchone()
    return row or {
        "status": "NotEnrolled", "consent_given": False, "consent_date": None,
        "enrolled_on": None, "notes": "", "date_updated": None,
    }


def current_period(connection: Connection, patient_id: str, enrolled_on: date_type | None, tz_name: str) -> dict:
    """The 30-day documentation period that contains today (in the viewer's time zone).

    Uses the stored period when there is one. Otherwise it is the next 30-day block after the latest stored
    period, or counted from the enrollment date."""
    today = connection.execute(
        "SELECT (now() AT TIME ZONE %(tz)s)::date AS today", {"tz": tz_name}
    ).fetchone()["today"]
    stored = connection.execute(
        """
        SELECT period_start, period_end, status, date_updated
        FROM rtm_documentation
        WHERE patient_id = %s AND is_deleted = false AND period_start <= %s AND period_end >= %s
        """,
        (patient_id, today, today),
    ).fetchone()
    if stored:
        return {"start": stored["period_start"], "end": stored["period_end"], "status": stored["status"],
                "stored": True, "today": today}

    latest = connection.execute(
        "SELECT MAX(period_end) AS latest FROM rtm_documentation WHERE patient_id = %s AND is_deleted = false",
        (patient_id,),
    ).fetchone()["latest"]
    anchor = latest + timedelta(days=1) if latest else (enrolled_on or today)
    if anchor > today:
        anchor = today
    start = anchor + timedelta(days=PERIOD_DAYS * ((today - anchor).days // PERIOD_DAYS))
    return {"start": start, "end": start + timedelta(days=PERIOD_DAYS - 1), "status": "NotStarted",
            "stored": False, "today": today}


def period_metrics(connection: Connection, patient_id: str, start: date_type, end: date_type, tz_name: str) -> dict:
    """The monitoring-status rows: what the app recorded and what the provider did, for one period."""
    params = {"pid": patient_id, "start": start, "end": end, "tz": tz_name}
    row = connection.execute(
        """
        SELECT
          (SELECT COUNT(DISTINCT (s.started_at AT TIME ZONE %(tz)s)::date)
             FROM sessions s
            WHERE s.patient_id = %(pid)s AND s.is_deleted = false
              AND (s.started_at AT TIME ZONE %(tz)s)::date BETWEEN %(start)s AND %(end)s)::int AS data_days,
          (SELECT COUNT(*)
             FROM sessions s
            WHERE s.patient_id = %(pid)s AND s.is_deleted = false
              AND (s.started_at AT TIME ZONE %(tz)s)::date BETWEEN %(start)s AND %(end)s)::int AS sessions,
          (SELECT COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 60)), 0)
             FROM sessions s
            WHERE s.patient_id = %(pid)s AND s.is_deleted = false
              AND (s.started_at AT TIME ZONE %(tz)s)::date BETWEEN %(start)s AND %(end)s)::int AS engagement_minutes,
          (SELECT COUNT(*)
             FROM response_entries r
            WHERE r.patient_id = %(pid)s AND r.is_deleted = false
              AND (r.recorded_at AT TIME ZONE %(tz)s)::date BETWEEN %(start)s AND %(end)s)::int AS response_entries,
          (SELECT COUNT(*)
             FROM rtm_activities a
            WHERE a.patient_id = %(pid)s AND a.is_deleted = false AND a.activity_type = 'Review'
              AND (a.started_at AT TIME ZONE %(tz)s)::date BETWEEN %(start)s AND %(end)s)::int AS reviews,
          (SELECT COUNT(*)
             FROM rtm_activities a
            WHERE a.patient_id = %(pid)s AND a.is_deleted = false AND a.activity_type = 'Communication'
              AND (a.started_at AT TIME ZONE %(tz)s)::date BETWEEN %(start)s AND %(end)s)::int AS communications,
          (SELECT COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (a.ended_at - a.started_at)) / 60)), 0)
             FROM rtm_activities a
            WHERE a.patient_id = %(pid)s AND a.is_deleted = false
              AND (a.started_at AT TIME ZONE %(tz)s)::date BETWEEN %(start)s AND %(end)s)::int AS management_minutes
        """,
        params,
    ).fetchone()
    return dict(row)


def patient_rtm(connection: Connection, patient_id: str, tz_name: str) -> dict:
    enrollment = _enrollment(connection, patient_id)
    period = current_period(connection, patient_id, enrollment["enrolled_on"], tz_name)
    metrics = period_metrics(connection, patient_id, period["start"], period["end"], tz_name)
    recent = connection.execute(
        """
        SELECT a.id, a.activity_type, a.started_at, a.summary,
               ROUND(EXTRACT(EPOCH FROM (a.ended_at - a.started_at)) / 60)::int AS minutes,
               u.display_name AS provider_name
        FROM rtm_activities a
        JOIN users u ON u.id = a.provider_id
        WHERE a.patient_id = %s AND a.is_deleted = false AND a.activity_type IN ('Review', 'ManagementTime')
        ORDER BY a.started_at DESC
        LIMIT 8
        """,
        (patient_id,),
    ).fetchall()
    past = connection.execute(
        """
        SELECT period_start, period_end, status
        FROM rtm_documentation
        WHERE patient_id = %s AND is_deleted = false AND period_end < %s
        ORDER BY period_start DESC
        LIMIT 3
        """,
        (patient_id, period["start"]),
    ).fetchall()
    history = []
    for h in past:
        m = period_metrics(connection, patient_id, h["period_start"], h["period_end"], tz_name)
        history.append({"start": h["period_start"], "end": h["period_end"], "status": h["status"],
                        "data_days": m["data_days"], "management_minutes": m["management_minutes"],
                        "qualifying_met": m["data_days"] >= RTM_QUALIFYING_DAYS})
    return {
        "enrollment": enrollment,
        "history": history,
        "period": {"start": period["start"], "end": period["end"],
                   "day_number": min(PERIOD_DAYS, (period["today"] - period["start"]).days + 1),
                   "length": PERIOD_DAYS},
        "metrics": metrics,
        "qualifying": {"required_days": RTM_QUALIFYING_DAYS, "days": metrics["data_days"],
                       "met": metrics["data_days"] >= RTM_QUALIFYING_DAYS},
        "documentation": {"status": period["status"]},
        "recent_activity": [{**r, "id": str(r["id"])} for r in recent],
        "notes": "Qualifying-day rule and time definitions are placeholders until PTI confirms them.",
    }


def caseload_rtm(connection: Connection, provider_id: str, tz_name: str) -> dict:
    patients = connection.execute(
        """
        SELECT p.id, p.first_name, p.last_name
        FROM assignments a
        JOIN patients p ON p.id = a.patient_id AND p.is_deleted = false
        WHERE a.provider_id = %s AND a.is_deleted = false
        ORDER BY p.last_name, p.first_name
        """,
        (provider_id,),
    ).fetchall()
    clients = []
    for p in patients:
        pid = str(p["id"])
        data = patient_rtm(connection, pid, tz_name)
        enrolled = data["enrollment"]["status"] == "Enrolled"
        clients.append({
            "patient_id": pid,
            "name": f"{p['first_name']} {p['last_name']}",
            "rtm_status": data["enrollment"]["status"],
            "consent_given": data["enrollment"]["consent_given"],
            "period": data["period"] if enrolled else None,
            "data_days": data["metrics"]["data_days"] if enrolled else None,
            "required_days": RTM_QUALIFYING_DAYS,
            "qualifying_met": data["qualifying"]["met"] if enrolled else None,
            "engagement_minutes": data["metrics"]["engagement_minutes"] if enrolled else None,
            "management_minutes": data["metrics"]["management_minutes"] if enrolled else None,
            "documentation_status": data["documentation"]["status"] if enrolled else None,
            "last_period": data["history"][0] if enrolled and data["history"] else None,
        })
    enrolled_clients = [c for c in clients if c["rtm_status"] == "Enrolled"]
    return {
        "summary": {
            "enrolled": len(enrolled_clients),
            "total": len(clients),
            "qualifying_met": sum(1 for c in enrolled_clients if c["qualifying_met"]),
            "documentation_complete": sum(1 for c in enrolled_clients if c["documentation_status"] == "Complete"),
            "documentation_open": sum(1 for c in enrolled_clients if c["documentation_status"] != "Complete"),
        },
        "clients": clients,
        "required_days": RTM_QUALIFYING_DAYS,
    }


# ---------------------------------------------------------------------------
# Access
# ---------------------------------------------------------------------------


def _require_assigned(connection: Connection, user: dict[str, str], patient_id: str) -> None:
    require_role(user, "provider")
    assigned = connection.execute(
        """
        SELECT 1 FROM assignments a
        JOIN patients p ON p.id = a.patient_id AND p.is_deleted = false
        WHERE a.patient_id = %s AND a.provider_id = %s AND a.is_deleted = false
        """,
        (patient_id, user["id"]),
    ).fetchone()
    if not assigned:
        raise HTTPException(status_code=403, detail="Patient is not assigned to this provider.")


def _audit(connection: Connection, user_id: str, action: str, entity: str, patient_id: str, detail: str) -> None:
    connection.execute(
        "INSERT INTO audit_log (user_id, action, entity_type, patient_id, detail) VALUES (%s, %s, %s, %s, %s)",
        (user_id, action, entity, patient_id, detail),
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/patients/{patient_id}/rtm")
def get_patient_rtm(
    patient_id: str,
    tz: str = Query(default=DEFAULT_TZ, description="IANA time zone, e.g. America/New_York"),
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> dict:
    """Monitoring status for the current 30-day period, plus enrollment and documentation."""
    _require_assigned(connection, user, patient_id)
    validate_tz(tz)
    return patient_rtm(connection, patient_id, tz)


@router.get("/providers/{provider_id}/rtm")
def get_caseload_rtm(
    provider_id: str,
    tz: str = Query(default=DEFAULT_TZ),
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> dict:
    """RTM status for every client on this provider's caseload."""
    require_role(user, "provider")
    if user["id"] != provider_id:
        raise HTTPException(status_code=403, detail="Providers can only access their own caseload.")
    validate_tz(tz)
    return caseload_rtm(connection, provider_id, tz)


class EnrollmentRequest(BaseModel):
    status: Literal["NotEnrolled", "Enrolled", "Withdrawn"]
    consent_given: bool
    consent_date: date_type | None = None
    notes: str = Field(default="", max_length=1000)

    @field_validator("notes")
    @classmethod
    def strip_notes(cls, value: str) -> str:
        return value.strip()


@router.put("/patients/{patient_id}/rtm/enrollment")
def put_enrollment(
    patient_id: str,
    payload: EnrollmentRequest,
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> dict:
    """Record RTM enrollment and consent. Enrolling requires documented consent."""
    _require_assigned(connection, user, patient_id)
    if payload.status == "Enrolled" and not payload.consent_given:
        raise HTTPException(status_code=422, detail="Consent must be recorded before a client can be enrolled.")
    existing = _enrollment(connection, patient_id)
    consent_date = payload.consent_date or existing["consent_date"] or (
        date_type.today() if payload.consent_given else None
    )
    if not payload.consent_given:
        consent_date = None
    enrolled_on = existing["enrolled_on"]
    if payload.status == "Enrolled" and not enrolled_on:
        enrolled_on = date_type.today()
    if payload.status != "Enrolled" and payload.status != "Withdrawn":
        enrolled_on = None
    connection.execute(
        """
        INSERT INTO rtm_enrollments
            (patient_id, provider_id, status, consent_given, consent_date, enrolled_on, notes)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (patient_id) DO UPDATE
           SET provider_id = EXCLUDED.provider_id, status = EXCLUDED.status,
               consent_given = EXCLUDED.consent_given, consent_date = EXCLUDED.consent_date,
               enrolled_on = EXCLUDED.enrolled_on, notes = EXCLUDED.notes,
               date_updated = now(), is_deleted = false, date_deleted = NULL
        """,
        (patient_id, user["id"], payload.status, payload.consent_given, consent_date, enrolled_on, payload.notes),
    )
    _audit(connection, user["id"], "UpdateRtmEnrollment", "rtm_enrollment", patient_id, payload.status)
    connection.commit()
    return {"status": payload.status, "consent_given": payload.consent_given,
            "consent_date": consent_date, "enrolled_on": enrolled_on, "notes": payload.notes}


class DocumentationRequest(BaseModel):
    status: Literal["NotStarted", "InProgress", "Complete"]
    tz: str = DEFAULT_TZ


@router.patch("/patients/{patient_id}/rtm/documentation")
def patch_documentation(
    patient_id: str,
    payload: DocumentationRequest,
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> dict:
    """Set the documentation status for the current 30-day period."""
    _require_assigned(connection, user, patient_id)
    validate_tz(payload.tz)
    enrollment = _enrollment(connection, patient_id)
    if enrollment["status"] != "Enrolled":
        raise HTTPException(status_code=409, detail="Documentation applies to enrolled clients only.")
    period = current_period(connection, patient_id, enrollment["enrolled_on"], payload.tz)
    connection.execute(
        """
        INSERT INTO rtm_documentation (patient_id, period_start, period_end, status, updated_by)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (patient_id, period_start) DO UPDATE
           SET status = EXCLUDED.status, updated_by = EXCLUDED.updated_by,
               date_updated = now(), is_deleted = false, date_deleted = NULL
        """,
        (patient_id, period["start"], period["end"], payload.status, user["id"]),
    )
    _audit(connection, user["id"], "UpdateRtmDocumentation", "rtm_documentation", patient_id, payload.status)
    connection.commit()
    return {"status": payload.status, "period": {"start": period["start"], "end": period["end"]}}


class ActivityRequest(BaseModel):
    activity_type: Literal["Review", "ManagementTime"]
    minutes: int = Field(ge=1, le=240)
    summary: str = Field(default="", max_length=1000)

    @field_validator("summary")
    @classmethod
    def strip_summary(cls, value: str) -> str:
        return value.strip()


@router.post("/patients/{patient_id}/rtm/activities", status_code=201)
def add_rtm_activity(
    patient_id: str,
    payload: ActivityRequest,
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> dict:
    """Log time spent reviewing the client's app data, or other RTM management time."""
    _require_assigned(connection, user, patient_id)
    if _enrollment(connection, patient_id)["status"] != "Enrolled":
        raise HTTPException(status_code=409, detail="Time can be logged for enrolled clients only.")
    row = connection.execute(
        """
        INSERT INTO rtm_activities (provider_id, patient_id, activity_type, started_at, ended_at, summary)
        VALUES (%s, %s, %s, now() - make_interval(mins => %s), now(), %s)
        RETURNING id, activity_type, started_at, summary
        """,
        (user["id"], patient_id, payload.activity_type, payload.minutes, payload.summary),
    ).fetchone()
    _audit(connection, user["id"], "LogRtmActivity", "rtm_activity", patient_id,
           f"{payload.activity_type} {payload.minutes} min")
    connection.commit()
    return {**row, "id": str(row["id"]), "minutes": payload.minutes}