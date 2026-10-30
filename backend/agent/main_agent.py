from __future__ import annotations

import json

from psycopg import Connection

from agent import ChatbotConfigurationError, ChatbotProviderError, generate_answer
from agent.tool_functions import get_chat_context


_DATA_FACETS = {
    "engagement": {
        "terms": {"app", "session", "sessions", "module", "modules", "activity", "activities", "usage", "platform", "xr", "vr", "mobile"},
        "patient_fields": {"name", "reflect_app_engagement"},
        "panel_fields": {"name", "sessions_last_30_days", "reflect_xr_sessions", "reflect_mobile_sessions", "last_active"},
    },
    "mood": {
        "terms": {"mood", "moods", "score", "scores", "feelings", "response", "responses", "trend", "trends"},
        "patient_fields": {"name", "therapeutic_response_mood"},
        "panel_fields": {"name", "average_mood_score", "recent_14_day_mood", "prior_14_day_mood"},
    },
    "rtm": {
        "terms": {"rtm", "98980", "minutes", "minute", "review", "management", "threshold", "target", "billing", "documentation", "consent", "enrollment"},
        "patient_fields": {"name", "rtm_workflow_and_reimbursement"},
        "panel_fields": {"name", "rtm_review_minutes_30d", "rtm_20_minute_target_met"},
    },
    "clinical": {
        "terms": {"diagnosis", "diagnoses", "condition", "conditions", "medical", "history", "allergy", "allergies", "note", "notes", "clinical", "therapy", "treatment"},
        "patient_fields": {"name", "medical_history", "recent_clinical_notes", "clinical_therapy_sessions", "patient_medications"},
        "panel_fields": {"name", "active_conditions"},
    },
}


def _references_previous_target(message: str) -> bool:
    normalized = message.casefold()
    return any(
        reference in normalized.split()
        for reference in ("he", "him", "his", "she", "her", "hers", "they", "them", "their", "that", "this")
    ) or any(
        phrase in normalized
        for phrase in ("that patient", "this patient", "that provider", "this provider", "the same patient")
    )


def _focus_context(context: dict, query: str) -> dict:
    """Keep the authorized records relevant to a question, without exposing unrelated sections."""
    words = set(query.casefold().replace("/", " ").replace("?", " ").split())
    matched_facets = [
        facet for facet in _DATA_FACETS.values()
        if words & facet["terms"]
    ]
    if not matched_facets:
        matched_facets = [
            _DATA_FACETS["engagement"],
            _DATA_FACETS["mood"],
            _DATA_FACETS["rtm"],
        ]

    if "selected_patients" in context:
        patient_fields = {"name"}
        for facet in matched_facets:
            patient_fields.update(facet["patient_fields"])
        focused_patients = []
        for patient in context["selected_patients"]:
            focused = {key: value for key, value in patient.items() if key in patient_fields}
            engagement = focused.get("reflect_app_engagement")
            if engagement:
                engagement = dict(engagement)
                engagement["recent_sessions"] = engagement.get("recent_sessions", [])[:3]
                engagement["top_modules"] = engagement.get("top_modules", [])[:3]
                focused["reflect_app_engagement"] = engagement
            moods = focused.get("therapeutic_response_mood")
            if moods:
                moods = dict(moods)
                moods["recent_mood_checks"] = moods.get("recent_mood_checks", [])[:3]
                focused["therapeutic_response_mood"] = moods
            focused_patients.append(focused)
        return {"selected_patients": focused_patients}

    if "assigned_patients_overview" in context:
        panel_fields = {"name"}
        for facet in matched_facets:
            panel_fields.update(facet["panel_fields"])
        rows = [
            {key: value for key, value in patient.items() if key in panel_fields}
            for patient in context["assigned_patients_overview"]
        ]
        return {"assigned_patients_overview": rows}

    return context


def answer_message(
    connection: Connection,
    user: dict[str, str],
    message: str,
) -> dict:
    previous = connection.execute(
        """
        SELECT data_used->'target'->>'id' AS target_id
        FROM chat_messages
        WHERE user_id = %s AND sender = 'Assistant' AND is_deleted = false
          AND data_used->'target'->>'id' IS NOT NULL
        ORDER BY date_created DESC
        LIMIT 1
        """,
        (user["id"],),
    ).fetchone()
    history_rows = connection.execute(
        """
        SELECT sender, content
        FROM (
            SELECT sender, content, date_created
            FROM chat_messages
            WHERE user_id = %s AND is_deleted = false
            ORDER BY date_created DESC
            LIMIT 10
        ) AS recent
        ORDER BY date_created
        """,
        (user["id"],),
    ).fetchall()
    history = [
        {
            "role": "user" if row["sender"] == "User" else "assistant",
            "content": row["content"],
        }
        for row in history_rows
    ]

    lookups = []
    selected_target = None

    def lookup_data(query: str) -> tuple[dict, dict | None]:
        nonlocal selected_target
        context, target = get_chat_context(
            connection,
            user,
            query,
            previous["target_id"] if previous and _references_previous_target(query) else None,
        )
        lookups.append({"query": query, "context": context})
        if target is not None:
            selected_target = target
        return _focus_context(context, query), target

    initial_context, initial_target = lookup_data(message)
    if initial_target is not None:
        selected_target = initial_target

    answer = generate_answer(
        role=user["role"],
        message=message,
        history=history,
        initial_context=initial_context,
        lookup_data=lookup_data,
    )

    target = selected_target
    target_type = target["type"] if target else None
    target_id = target["id"] if target else None
    about_patient_id = target_id if target_type == "patient" else None
    about_provider_id = None if about_patient_id else (target_id if target_type == "provider" else user["id"])
    target_metadata = {"type": target_type, "id": target_id} if target else None

    user_row = connection.execute(
        """
        INSERT INTO chat_messages
            (user_id, about_patient_id, about_provider_id, sender, content)
        VALUES (%s, %s, %s, 'User', %s)
        RETURNING id, date_created
        """,
        (user["id"], about_patient_id, about_provider_id, message),
    ).fetchone()
    assistant_row = connection.execute(
        """
        INSERT INTO chat_messages
            (user_id, about_patient_id, about_provider_id, sender, content, data_used)
        VALUES (%s, %s, %s, 'Assistant', %s, %s::jsonb)
        RETURNING id, date_created
        """,
        (
            user["id"],
            about_patient_id,
            about_provider_id,
            answer,
            json.dumps({"target": target_metadata, "records": lookups}, default=str),
        ),
    ).fetchone()

    return {
        "user_message": {
            "id": str(user_row["id"]),
            "sender": "User",
            "content": message,
            "date_created": user_row["date_created"],
        },
        "assistant_message": {
            "id": str(assistant_row["id"]),
            "sender": "Assistant",
            "content": answer,
            "date_created": assistant_row["date_created"],
        },
    }


__all__ = ["answer_message", "ChatbotConfigurationError", "ChatbotProviderError"]