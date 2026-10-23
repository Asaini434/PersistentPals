from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection
from pydantic import BaseModel, Field, field_validator

from .auth import get_current_user, require_role
from .database import get_connection
from .providers import _provider_patients

router = APIRouter(tags=["patients"])


@router.get("/logs/patient-list")
def patient_list(
    provider_id: str | None = Query(default=None, alias="providerId"),
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    require_role(user, "admin", "provider")
    resolved_provider_id = provider_id or user["id"]
    if user["role"] == "provider" and resolved_provider_id != user["id"]:
        raise HTTPException(status_code=403, detail="Providers can only access their own patients.")
    return _provider_patients(connection, resolved_provider_id)


@router.get("/patients/{patient_id}")
def patient_details(
    patient_id: str,
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> dict:
    require_role(user, "admin", "provider")
    patient = connection.execute(
        """
        SELECT p.id, p.email, p.first_name, p.last_name, p.phone, p.gender,
               p.date_of_birth,
               EXTRACT(YEAR FROM age(current_date, p.date_of_birth))::int AS age
        FROM patients AS p
        WHERE p.id = %s AND p.is_deleted = false
        """,
        (patient_id,),
    ).fetchone()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found.")

    if user["role"] == "provider":
        assigned = connection.execute(
            """
            SELECT 1 FROM assignments
            WHERE patient_id = %s AND provider_id = %s AND is_deleted = false
            """,
            (patient_id, user["id"]),
        ).fetchone()
        if not assigned:
            raise HTTPException(status_code=403, detail="Patient is not assigned to this provider.")

    medical_history = connection.execute(
        """
        SELECT condition, status, severity, onset_date, treatment_start_date, notes, date_created
        FROM patient_medical_history
        WHERE patient_id = %s AND is_deleted = false
        ORDER BY date_created DESC
        """,
        (patient_id,),
    ).fetchall()
    clinical_logs = connection.execute(
        """
        SELECT n.id, n.note_type, n.content, n.date_created, n.clinical_session_id,
               u.display_name AS provider_name
        FROM provider_notes AS n
        JOIN users AS u ON u.id = n.provider_id
        WHERE n.patient_id = %s AND n.is_deleted = false
        ORDER BY n.date_created DESC
        """,
        (patient_id,),
    ).fetchall()
    app_sessions = connection.execute(
        """
        SELECT s.id, s.module_id, m.name AS application_name, m.platform,
               s.started_at AS in_time, s.ended_at AS out_time,
               EXTRACT(EPOCH FROM (s.ended_at - s.started_at))::int AS duration_seconds,
               s.started_at::date AS session_date
        FROM sessions AS s
        JOIN modules AS m ON m.id = s.module_id
        WHERE s.patient_id = %s AND s.is_deleted = false
        ORDER BY s.started_at DESC
        """,
        (patient_id,),
    ).fetchall()
    clinical_sessions = connection.execute(
        """
        SELECT s.id, s.provider_id, u.display_name AS provider_name, s.mode,
               s.started_at AS in_time, s.ended_at AS out_time,
               EXTRACT(EPOCH FROM (s.ended_at - s.started_at))::int AS duration_seconds,
               s.started_at::date AS session_date
        FROM clinical_sessions AS s
        JOIN users AS u ON u.id = s.provider_id
        WHERE s.patient_id = %s AND s.is_deleted = false
        ORDER BY s.started_at DESC
        """,
        (patient_id,),
    ).fetchall()
    medications = connection.execute(
        """
        SELECT id, name, dosage, frequency, started_on, status, notes
        FROM patient_medications
        WHERE patient_id = %s AND is_deleted = false
        ORDER BY status, started_on DESC
        """,
        (patient_id,),
    ).fetchall()
    communications = connection.execute(
        """
        SELECT a.id, a.direction, a.channel, a.summary, a.started_at,
               EXTRACT(EPOCH FROM (a.ended_at - a.started_at))::int AS duration_seconds,
               u.display_name AS provider_name
        FROM rtm_activities AS a
        JOIN users AS u ON u.id = a.provider_id
        WHERE a.patient_id = %s AND a.activity_type = 'Communication' AND a.is_deleted = false
        ORDER BY a.started_at DESC
        """,
        (patient_id,),
    ).fetchall()
    providers = connection.execute(
        """
        SELECT u.id, u.display_name, u.email, u.specialty
        FROM assignments AS a
        JOIN users AS u ON u.id = a.provider_id
        WHERE a.patient_id = %s AND a.is_deleted = false AND u.is_deleted = false
        ORDER BY u.display_name
        """,
        (patient_id,),
    ).fetchall()

    return {
        "id": str(patient["id"]),
        "name": f"{patient['first_name']} {patient['last_name']}".strip(),
        "email": patient["email"],
        "phone": patient["phone"],
        "gender": patient["gender"],
        "date_of_birth": patient["date_of_birth"],
        "age": patient["age"],
        "providers": [
            {
                "id": str(provider["id"]),
                "name": provider["display_name"],
                "email": provider["email"],
                "specialty": provider["specialty"],
            }
            for provider in providers
        ],
        "medical_history": medical_history,
        "medications": [{**row, "id": str(row["id"])} for row in medications],
        "communications": [{**row, "id": str(row["id"])} for row in communications],
        "logs": [
            {
                "id": str(log["id"]),
                "timestamp": log["date_created"],
                "note": log["content"],
                "type": log["note_type"],
                "provider_name": log["provider_name"],
                "clinical_session_id": str(log["clinical_session_id"]) if log["clinical_session_id"] else None,
            }
            for log in clinical_logs
        ],
        "sessions": [
            {
                **session,
                "id": str(session["id"]),
                "module_id": str(session["module_id"]),
            }
            for session in app_sessions
        ],
        "clinical_sessions": [
            {**session, "id": str(session["id"]), "provider_id": str(session["provider_id"])}
            for session in clinical_sessions
        ],
    }


# ---------------------------------------------------------------------------
# Writes: provider notes and logged communications
# ---------------------------------------------------------------------------


def _require_assigned_provider(connection: Connection, user: dict[str, str], patient_id: str) -> None:
    """Only the provider assigned to this patient may add records for them."""
    require_role(user, "provider")
    assigned = connection.execute(
        """
        SELECT 1 FROM assignments AS a
        JOIN patients AS p ON p.id = a.patient_id AND p.is_deleted = false
        WHERE a.patient_id = %s AND a.provider_id = %s AND a.is_deleted = false
        """,
        (patient_id, user["id"]),
    ).fetchone()
    if not assigned:
        raise HTTPException(status_code=403, detail="Patient is not assigned to this provider.")


class NoteRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    clinical_session_id: str | None = None

    @field_validator("content")
    @classmethod
    def require_nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Note cannot be blank.")
        return value


class CommunicationRequest(BaseModel):
    direction: Literal["Inbound", "Outbound"]
    channel: Literal["Email", "Text", "Phone", "Portal", "Other"]
    summary: str = Field(min_length=1, max_length=1000)
    minutes: int = Field(default=0, ge=0, le=120)

    @field_validator("summary")
    @classmethod
    def require_nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Summary cannot be blank.")
        return value


@router.post("/patients/{patient_id}/notes", status_code=201)
def add_note(
    patient_id: str,
    payload: NoteRequest,
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> dict:
    """A note tied to a therapy session is a SessionNote; otherwise it is a TrendLog."""
    _require_assigned_provider(connection, user, patient_id)

    note_type = "TrendLog"
    if payload.clinical_session_id:
        session = connection.execute(
            """
            SELECT 1 FROM clinical_sessions
            WHERE id = %s AND patient_id = %s AND provider_id = %s AND is_deleted = false
            """,
            (payload.clinical_session_id, patient_id, user["id"]),
        ).fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Therapy session not found for this patient.")
        note_type = "SessionNote"

    row = connection.execute(
        """
        INSERT INTO provider_notes (provider_id, patient_id, clinical_session_id, note_type, content)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id, note_type, content, date_created, clinical_session_id
        """,
        (user["id"], patient_id, payload.clinical_session_id, note_type, payload.content),
    ).fetchone()
    connection.execute(
        """
        INSERT INTO audit_log (user_id, action, entity_type, patient_id, detail)
        VALUES (%s, 'CreateNote', 'provider_note', %s, %s)
        """,
        (user["id"], patient_id, f"Added {note_type}"),
    )
    author = connection.execute("SELECT display_name FROM users WHERE id = %s", (user["id"],)).fetchone()
    connection.commit()
    return {
        "id": str(row["id"]),
        "timestamp": row["date_created"],
        "note": row["content"],
        "type": row["note_type"],
        "provider_name": author["display_name"],
        "clinical_session_id": str(row["clinical_session_id"]) if row["clinical_session_id"] else None,
    }


@router.post("/patients/{patient_id}/communications", status_code=201)
def add_communication(
    patient_id: str,
    payload: CommunicationRequest,
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> dict:
    """Log an asynchronous provider/patient exchange that happened on another channel."""
    _require_assigned_provider(connection, user, patient_id)

    row = connection.execute(
        """
        INSERT INTO rtm_activities
            (provider_id, patient_id, activity_type, direction, channel, started_at, ended_at, summary)
        VALUES (%s, %s, 'Communication', %s, %s, now(), now() + make_interval(mins => %s), %s)
        RETURNING id, direction, channel, summary, started_at,
                  EXTRACT(EPOCH FROM (ended_at - started_at))::int AS duration_seconds
        """,
        (user["id"], patient_id, payload.direction, payload.channel, payload.minutes, payload.summary),
    ).fetchone()
    connection.execute(
        """
        INSERT INTO audit_log (user_id, action, entity_type, patient_id, detail)
        VALUES (%s, 'LogCommunication', 'rtm_activity', %s, %s)
        """,
        (user["id"], patient_id, f"{payload.direction} {payload.channel}"),
    )
    author = connection.execute("SELECT display_name FROM users WHERE id = %s", (user["id"],)).fetchone()
    connection.commit()
    return {**row, "id": str(row["id"]), "provider_name": author["display_name"]}