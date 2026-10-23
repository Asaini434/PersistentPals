from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection

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
        SELECT condition, status, onset_date, notes, date_created
        FROM patient_medical_history
        WHERE patient_id = %s AND is_deleted = false
        ORDER BY date_created DESC
        """,
        (patient_id,),
    ).fetchall()
    clinical_logs = connection.execute(
        """
        SELECT n.id, n.note_type, n.content, n.date_created,
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
        "logs": [
            {
                "id": str(log["id"]),
                "timestamp": log["date_created"],
                "note": log["content"],
                "type": log["note_type"],
                "provider_name": log["provider_name"],
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