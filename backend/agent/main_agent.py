from __future__ import annotations

import json
import re

from psycopg import Connection

from agent import ChatbotConfigurationError, ChatbotProviderError, generate_answer
from agent.mcp_server import call_dashboard_tool, create_dashboard_mcp
from agent.tool_functions import get_chat_context


_DATA_FACETS = {
    "engagement": {
        "terms": {"app", "session", "sessions", "module", "modules", "activity", "activities", "usage", "platform", "xr", "vr", "mobile", "behavior", "behaviour", "pattern", "patterns", "predict", "predictive", "likely", "engagement", "intervention", "interventions", "recommendation", "recommendations", "personalize", "personalized", "next", "step", "steps", "strategy", "strategies", "support", "treatment", "decision", "decide", "care"},
        "patient_fields": {"name", "reflect_app_engagement"},
        "panel_fields": {"name", "sessions_last_30_days", "sessions_last_7_days", "sessions_previous_7_days", "reflect_xr_sessions", "reflect_mobile_sessions", "last_active"},
    },
    "mood": {
        "terms": {"mood", "moods", "score", "scores", "feelings", "response", "responses", "trend", "trends", "behavior", "behaviour", "pattern", "patterns", "predict", "predictive", "likely", "intervention", "interventions", "recommendation", "recommendations", "personalize", "personalized", "next", "step", "steps", "strategy", "strategies", "support", "treatment", "decision", "decide", "care"},
        "patient_fields": {"name", "therapeutic_response_mood"},
        "panel_fields": {"name", "average_mood_score", "recent_14_day_mood", "prior_14_day_mood", "recent_14d_entries", "prior_14d_entries"},
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

_SENSITIVE_REQUEST_PATTERNS = (
    re.compile(r"\b(?:full\s+)?names?\s+of\s+(?:the\s+)?patients?\b", re.I),
    re.compile(r"\bpatient\s+roster\b", re.I),
    re.compile(r"\b(?:patient\s+)?(?:identity|identities|identifiers?)\b", re.I),
    re.compile(r"\b(?:list|show|give|provide)\s+(?:(?:all|my|assigned)\s+)*(?:the\s+)?patients\b", re.I),
    re.compile(r"\b(?:patient|client)'?s?\s+(?:full\s+)?name\b", re.I),
    re.compile(r"\b(?:who\s+is|who's)\s+(?:the\s+)?patient\b", re.I),
    re.compile(r"\b(?:what\s+is|what's|tell\s+me|give\s+me|provide)\s+(?:their|his|her)\s+(?:full\s+)?name\b", re.I),
    re.compile(r"\bwho\s+(?:(?:all\s+)?are\s+)?(?:all\s+)?my\s+patients\b", re.I),
    re.compile(r"\b(?:list|show|give|provide|tell)\b.{0,40}\bpatient\s+names?\b", re.I),
    re.compile(
        r"\b(?:e-?mail|phone(?:\s+number)?|telephone|contact\s+(?:details|information)|"
        r"home\s+address|street\s+address|where\s+(?:does|do)\s+(?:the\s+)?patient\s+live|"
        r"date\s+of\s+birth|dob|exact\s+age|age|gender|sex|ssn|social\s+security|government\s+id|insurance\s+id|"
        r"medical\s+record\s+number|mrn|patient\s+(?:id|number)|record\s+id|credentials?|"
        r"username|login\s+(?:details|credentials)|bearer\s+token|jwt|password|passcode|"
        r"api\s+key|access\s+token|secret\s+key|private\s+key)\b",
        re.I,
    ),
)
_SENSITIVE_TEXT_PATTERNS = (
    re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I),
    re.compile(r"\b\d{3}[- ]?\d{2}[- ]?\d{4}\b"),
    re.compile(r"(?<!\w)(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}(?!\w)"),
    re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b", re.I),
    re.compile(r"\b(?:username|password|passcode|api[_ -]?key|access[_ -]?token|bearer[_ -]?token|jwt|secret)\s*(?:[:=]|is\s+)?\s*[^\s,;]+", re.I),
    re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"),
    re.compile(r"\b\d{1,6}\s+[\w. ]{1,40}\s(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|court|ct)\b", re.I),
)
_SENSITIVE_REQUEST_REPLY = (
    "I can’t provide patient identifiers or credentials. Use the authorized patient record for identity and contact details."
)


def _references_previous_target(message: str) -> bool:
    normalized = message.casefold()
    return any(
        reference in normalized.split()
        for reference in ("he", "him", "his", "she", "her", "hers", "they", "them", "their", "that", "this")
    ) or any(
        phrase in normalized
        for phrase in ("that patient", "this patient", "that provider", "this provider", "the same patient")
    )


def _requests_sensitive_data(message: str) -> bool:
    return any(pattern.search(message) for pattern in _SENSITIVE_REQUEST_PATTERNS)


def _redact_sensitive_text(
    value: str,
    patient_names: set[str] | None = None,
    patient_sensitive_values: set[str] | None = None,
) -> str:
    redacted = value
    for pattern in _SENSITIVE_TEXT_PATTERNS:
        redacted = pattern.sub("[REDACTED]", redacted)
    for name in sorted(patient_names or (), key=len, reverse=True):
        for name_part in sorted({part for part in name.split() if len(part) > 1}, key=len, reverse=True):
            redacted = re.sub(
                rf"(?<!\w){re.escape(name_part)}(?!\w)",
                "[patient]",
                redacted,
                flags=re.IGNORECASE,
            )
    for sensitive_value in sorted(patient_sensitive_values or (), key=len, reverse=True):
        if sensitive_value:
            redacted = re.sub(
                rf"(?<!\w){re.escape(sensitive_value)}(?!\w)",
                "[REDACTED]",
                redacted,
                flags=re.IGNORECASE,
            )
    return redacted


def _sanitize_model_context(
    value: object,
    patient_names: set[str],
    patient_sensitive_values: set[str] | None = None,
) -> object:
    """Remove direct identifiers recursively before records reach the model."""
    blocked_keys = {
        "id", "patientid", "userid", "providerid", "uuid", "name", "patientname",
        "fullname", "firstname", "middlename", "lastname", "displayname", "age",
        "gender", "email", "phone",
        "phonenumber", "mobilenumber", "telephone", "contact", "contactinfo",
        "contactdetails", "address", "homeaddress", "streetaddress", "dob",
        "birthdate", "dateofbirth",
        "ssn", "socialsecuritynumber", "mrn", "medicalrecordnumber", "username",
        "password", "passcode", "credential", "credentials", "token", "bearertoken",
        "jwt", "secret",
        "secretkey", "apikey", "accesskey",
    }
    if isinstance(value, dict):
        sanitized = {}
        for key, item in value.items():
            normalized_key = re.sub(r"[^a-z0-9]", "", str(key).casefold())
            if (
                normalized_key in blocked_keys
                or normalized_key.endswith(("id", "email", "credential", "token"))
                or "phone" in normalized_key
                or "address" in normalized_key
            ):
                continue
            sanitized[key] = _sanitize_model_context(item, patient_names, patient_sensitive_values)
        return sanitized
    if isinstance(value, list):
        return [_sanitize_model_context(item, patient_names, patient_sensitive_values) for item in value]
    if isinstance(value, str):
        return _redact_sensitive_text(value, patient_names, patient_sensitive_values)
    return value


def _build_trend_comparison(
    recent: int | float | None,
    previous: int | float | None,
    recent_count: int | None = None,
    previous_count: int | None = None,
) -> dict | None:
    if not isinstance(recent, (int, float)) or not isinstance(previous, (int, float)):
        return None

    change = round(recent - previous, 1)
    return {
        "recent_value": recent,
        "previous_value": previous,
        "change": change,
        "direction": "increased" if change > 0 else "decreased" if change < 0 else "unchanged",
        "recent_observations": recent_count,
        "previous_observations": previous_count,
    }


def _add_database_trend_comparisons(patient: dict) -> dict:
    """Calculate trend comparisons from values returned by the database queries."""
    trends = {}
    engagement = patient.get("reflect_app_engagement", {})
    sessions = _build_trend_comparison(
        engagement.get("sessions_last_7_days"),
        engagement.get("sessions_previous_7_days"),
        engagement.get("sessions_last_7_days"),
        engagement.get("sessions_previous_7_days"),
    )
    if sessions is not None:
        trends["app_sessions_week_over_week"] = sessions

    mood = patient.get("therapeutic_response_mood", {})
    mood_comparison = _build_trend_comparison(
        mood.get("recent_14d_avg_mood"),
        mood.get("prior_14d_avg_mood"),
        mood.get("recent_14d_entries"),
        mood.get("prior_14d_entries"),
    )
    if mood_comparison is not None:
        trends["mood_average_14_day_windows"] = mood_comparison

    if trends:
        patient["database_trend_comparisons"] = trends
        considerations = _build_provider_considerations(trends)
        if considerations:
            patient["provider_considerations"] = considerations
    return patient


def _build_provider_considerations(trends: dict) -> list[dict]:
    """Offer low-risk provider follow-ups for supported changes, not treatment orders."""
    considerations = []
    mood = trends.get("mood_average_14_day_windows")
    if mood:
        enough_mood_data = (
            (mood.get("recent_observations") or 0) >= 2
            and (mood.get("previous_observations") or 0) >= 2
        )
        if enough_mood_data and mood["change"] <= -0.5:
            considerations.append({
                "pattern": "Mood average decreased across comparable 14-day windows.",
                "evidence": mood,
                "consideration": "Review the recent entries with the patient and ask what context they think may relate to the change; the records do not establish a cause.",
            })
        elif enough_mood_data and mood["change"] >= 0.5:
            considerations.append({
                "pattern": "Mood average increased across comparable 14-day windows.",
                "evidence": mood,
                "consideration": "Ask the patient what they feel has been helpful and continue tracking; the records do not establish what caused the change.",
            })
        elif not enough_mood_data:
            considerations.append({
                "pattern": "Mood comparison has fewer than two entries in one or both windows.",
                "evidence": mood,
                "consideration": "Treat this comparison as preliminary and gather the patient's context or more observations before drawing conclusions.",
            })

    engagement = trends.get("app_sessions_week_over_week")
    if engagement:
        previous_sessions = engagement.get("previous_value", 0)
        recent_sessions = engagement.get("recent_value", 0)
        if previous_sessions >= 3 and recent_sessions <= previous_sessions * 0.6:
            considerations.append({
                "pattern": "App sessions decreased by at least 40% week over week.",
                "evidence": engagement,
                "consideration": "Check with the patient about access, schedule, or format barriers and ask which app activities remain useful to them.",
            })
        elif recent_sessions >= 2 and recent_sessions >= max(previous_sessions * 1.4, 2):
            considerations.append({
                "pattern": "App sessions increased by at least 40% week over week.",
                "evidence": engagement,
                "consideration": "Confirm with the patient that the increased use feels manageable and useful, and continue monitoring engagement alongside mood.",
            })

    return considerations


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
            focused_patients.append(_add_database_trend_comparisons(focused))
        return {"selected_patients": focused_patients}

    if "assigned_patients_overview" in context:
        panel_fields = {"name"}
        for facet in matched_facets:
            panel_fields.update(facet["panel_fields"])
        rows = []
        for patient in context["assigned_patients_overview"]:
            focused = {key: value for key, value in patient.items() if key in panel_fields}
            trend_patient = {
                "reflect_app_engagement": {
                    "sessions_last_7_days": focused.get("sessions_last_7_days"),
                    "sessions_previous_7_days": focused.get("sessions_previous_7_days"),
                },
                "therapeutic_response_mood": {
                    "recent_14d_avg_mood": focused.get("recent_14_day_mood"),
                    "prior_14d_avg_mood": focused.get("prior_14_day_mood"),
                    "recent_14d_entries": focused.get("recent_14d_entries"),
                    "prior_14d_entries": focused.get("prior_14d_entries"),
                },
            }
            trend_comparisons = _add_database_trend_comparisons(trend_patient).get("database_trend_comparisons")
            if trend_comparisons:
                focused["database_trend_comparisons"] = trend_comparisons
            rows.append(focused)
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
    patient_names: set[str] = set()
    patient_sensitive_values: set[str] = set()

    def collect_patient_names(context: dict) -> None:
        patient_records = context.get("selected_patients") or context.get("assigned_patients_overview") or []
        patient_names.update(
            record["name"].strip()
            for record in patient_records
            if isinstance(record.get("name"), str) and record["name"].strip()
        )
        for record in patient_records:
            age = record.get("age")
            if isinstance(age, (int, float)):
                patient_sensitive_values.add(str(age))
            gender = record.get("gender")
            if isinstance(gender, str) and len(gender.strip()) > 1:
                patient_sensitive_values.add(gender.strip())
        patient_names.update(
            name.strip()
            for name in context.get("patient_names", [])
            if isinstance(name, str) and name.strip()
        )

    def lookup_from_database(query: str) -> dict:
        nonlocal selected_target
        context, target = get_chat_context(
            connection,
            user,
            query,
            previous["target_id"] if previous and _references_previous_target(query) else None,
        )
        collect_patient_names(context)
        lookups.append({"query": query, "context": context})
        if target is not None:
            selected_target = target
        focused = _focus_context(context, query)
        return {
            "records": _sanitize_model_context(focused, patient_names, patient_sensitive_values)
        }

    mcp_server = create_dashboard_mcp(lookup_from_database)

    def lookup_data(query: str) -> tuple[dict, dict | None]:
        try:
            result = call_dashboard_tool(mcp_server, query)
        except Exception as error:
            raise ChatbotProviderError("The dashboard data tool could not complete the lookup.") from error
        return result["records"], selected_target

    sensitive_request = _requests_sensitive_data(message)
    if sensitive_request:
        initial_context = {}
        answer = _SENSITIVE_REQUEST_REPLY
    else:
        initial_context, initial_target = lookup_data(message)
        if initial_target is not None:
            selected_target = initial_target
        safe_history = [
            {
                **item,
                "content": _redact_sensitive_text(
                    item["content"], patient_names, patient_sensitive_values
                ),
            }
            for item in history
        ]
        answer = generate_answer(
            role=user["role"],
            message=_redact_sensitive_text(message, patient_names, patient_sensitive_values),
            history=safe_history,
            initial_context=initial_context,
            lookup_data=lookup_data,
        )
        answer = _redact_sensitive_text(answer, patient_names, patient_sensitive_values)

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