from __future__ import annotations

from psycopg import Connection


def _mentioned_targets(targets: list[dict], message: str) -> list[dict]:
    normalized_message = message.casefold()
    mentioned = []
    for target in targets:
        name_parts = [
            part for part in target["name"].casefold().replace(".", "").split()
            if part not in {"dr"}
        ]
        if name_parts and all(part in normalized_message for part in name_parts):
            mentioned.append(target)
    if not mentioned:
        partial_matches = [
            target
            for target in targets
            if any(
                part in normalized_message
                for part in target["name"].casefold().replace(".", "").split()
                if part != "dr"
            )
        ]
        if len(partial_matches) == 1:
            return partial_matches
    return mentioned


def _patient_record(connection: Connection, provider_id: str, patient: dict) -> dict:
    patient_id = patient["id"]
    history = connection.execute(
        """
        SELECT condition, status, onset_date, notes
        FROM patient_medical_history
        WHERE patient_id = %s AND is_deleted = false
        ORDER BY date_created DESC
        LIMIT 12
        """,
        (patient_id,),
    ).fetchall()
    notes = connection.execute(
        """
        SELECT note_type, content, date_created
        FROM provider_notes
        WHERE patient_id = %s AND provider_id = %s AND is_deleted = false
        ORDER BY date_created DESC
        LIMIT 8
        """,
        (patient_id, provider_id),
    ).fetchall()
    engagement = connection.execute(
        """
        SELECT COUNT(*) FILTER (WHERE started_at >= now() - interval '30 days')::int AS sessions_30_days,
               MAX(started_at) AS last_session_at
        FROM sessions
        WHERE patient_id = %s AND is_deleted = false
        """,
        (patient_id,),
    ).fetchone()
    enrollment = connection.execute(
        """
        SELECT status, consent_given, enrolled_on
        FROM rtm_enrollments
        WHERE patient_id = %s AND provider_id = %s AND is_deleted = false
        """,
        (patient_id, provider_id),
    ).fetchone()

    return {
        "id": str(patient_id),
        "name": patient["name"],
        "age": patient["age"],
        "gender": patient["gender"],
        "medical_history": history,
        "recent_notes": notes,
        "app_engagement": engagement,
        "rtm_enrollment": enrollment,
    }


def get_chat_context(
    connection: Connection,
    user: dict[str, str],
    message: str,
    previous_target_id: str | None = None,
) -> tuple[dict, dict | None]:
    """Fetch bounded records only from the caller's role-authorized scope."""
    if user["role"] == "provider":
        rows = connection.execute(
            """
            SELECT p.id, concat_ws(' ', p.first_name, p.last_name) AS name,
                   EXTRACT(YEAR FROM age(current_date, p.date_of_birth))::int AS age,
                   p.gender
            FROM assignments AS a
            JOIN patients AS p ON p.id = a.patient_id
            WHERE a.provider_id = %s AND a.is_deleted = false AND p.is_deleted = false
            ORDER BY p.last_name, p.first_name
            LIMIT 100
            """,
            (user["id"],),
        ).fetchall()
        patients = [{**row, "id": str(row["id"])} for row in rows]
        mentioned = _mentioned_targets(patients, message)
        if not mentioned and previous_target_id:
            mentioned = [patient for patient in patients if patient["id"] == previous_target_id]
        selected = mentioned[:3]
        if selected:
            records = [_patient_record(connection, user["id"], patient) for patient in selected]
            return (
                {"patients": records},
                {"type": "patient", "id": records[0]["id"]} if len(records) == 1 else None,
            )
        return {"available_patients": [{"name": row["name"]} for row in patients]}, None

    rows = connection.execute(
        """
        SELECT u.id, u.display_name AS name, u.title, u.specialty,
               COUNT(a.patient_id) FILTER (WHERE a.is_deleted = false)::int AS active_patient_count
        FROM users AS u
        LEFT JOIN assignments AS a ON a.provider_id = u.id
        WHERE u.role = 'Provider' AND u.is_deleted = false
        GROUP BY u.id
        ORDER BY u.display_name
        LIMIT 100
        """
    ).fetchall()
    providers = [{**row, "id": str(row["id"])} for row in rows]
    mentioned = _mentioned_targets(providers, message)
    if not mentioned and previous_target_id:
        mentioned = [provider for provider in providers if provider["id"] == previous_target_id]
    selected = mentioned[:3]
    if selected:
        records = [
            {
                "id": provider["id"],
                "name": provider["name"],
                "title": provider["title"],
                "specialty": provider["specialty"],
                "active_patient_count": provider["active_patient_count"],
            }
            for provider in selected
        ]
        return (
            {"providers": records},
            {"type": "provider", "id": records[0]["id"]} if len(records) == 1 else None,
        )
    return (
        {
            "available_providers": [
                {
                    "name": row["name"],
                    "title": row["title"],
                    "specialty": row["specialty"],
                    "active_patient_count": row["active_patient_count"],
                }
                for row in providers
            ]
        },
        None,
    )
