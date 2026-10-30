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
        elif target.get("id") and target["id"].lower() in normalized_message:
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
        if partial_matches:
            return partial_matches
    return mentioned


def _patient_record(connection: Connection, provider_id: str, patient: dict) -> dict:
    patient_id = patient["id"]

    # 1. Medical History
    history = connection.execute(
        """
        SELECT condition, status, onset_date, notes
        FROM patient_medical_history
        WHERE patient_id = %s AND is_deleted = false
        ORDER BY date_created DESC
        LIMIT 10
        """,
        (patient_id,),
    ).fetchall()

    # 2. Clinical Notes & Observations
    notes = connection.execute(
        """
        SELECT note_type, content, date_created
        FROM provider_notes
        WHERE patient_id = %s AND provider_id = %s AND is_deleted = false
        ORDER BY date_created DESC
        LIMIT 6
        """,
        (patient_id, provider_id),
    ).fetchall()

    # 3. Reflect XR vs Reflect Mobile Engagement Metrics
    engagement = connection.execute(
        """
        SELECT 
            COUNT(*)::int AS total_sessions,
            COUNT(*) FILTER (WHERE s.started_at >= now() - interval '30 days')::int AS sessions_last_30_days,
            COUNT(*) FILTER (WHERE s.started_at >= now() - interval '7 days')::int AS sessions_last_7_days,
            COUNT(*) FILTER (WHERE s.started_at >= now() - interval '14 days'
                              AND s.started_at < now() - interval '7 days')::int AS sessions_previous_7_days,
            COUNT(*) FILTER (WHERE m.platform = 'XR')::int AS reflect_xr_sessions,
            COUNT(*) FILTER (WHERE m.platform = 'Mobile')::int AS reflect_mobile_sessions,
            ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 60), 0))::int AS total_duration_minutes,
            ROUND(COALESCE(AVG(EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 60), 0))::int AS avg_session_minutes,
            MAX(s.started_at) AS last_active_at
        FROM sessions s
        JOIN modules m ON m.id = s.module_id
        WHERE s.patient_id = %s AND s.is_deleted = false
        """,
        (patient_id,),
    ).fetchone()

    # Top modules / interventions used
    top_modules = connection.execute(
        """
        SELECT 
            m.name AS module_name,
            m.platform,
            m.description,
            COUNT(*)::int AS session_count,
            MAX(s.started_at) AS last_used_at
        FROM sessions s
        JOIN modules m ON m.id = s.module_id
        WHERE s.patient_id = %s AND s.is_deleted = false
        GROUP BY m.name, m.platform, m.description
        ORDER BY session_count DESC
        LIMIT 4
        """,
        (patient_id,),
    ).fetchall()

    # Recent app sessions
    recent_sessions = connection.execute(
        """
        SELECT 
            m.name AS module,
            m.platform,
            s.started_at,
            ROUND(EXTRACT(EPOCH FROM (s.ended_at - s.started_at)) / 60)::int AS duration_minutes
        FROM sessions s
        JOIN modules m ON m.id = s.module_id
        WHERE s.patient_id = %s AND s.is_deleted = false
        ORDER BY s.started_at DESC
        LIMIT 5
        """,
        (patient_id,),
    ).fetchall()

    # 4. Therapeutic Response & Mood Tracking (response_entries)
    mood_summary = connection.execute(
        """
        SELECT 
            COUNT(*)::int AS total_entries,
            COUNT(*) FILTER (WHERE recorded_at >= now() - interval '14 days')::int AS recent_14d_entries,
            COUNT(*) FILTER (WHERE recorded_at >= now() - interval '28 days'
                              AND recorded_at < now() - interval '14 days')::int AS prior_14d_entries,
            ROUND(AVG(mood_score)::numeric, 1)::float AS avg_mood_score,
            ROUND(AVG(mood_score) FILTER (WHERE recorded_at >= now() - interval '14 days')::numeric, 1)::float AS recent_14d_avg_mood,
            ROUND(AVG(mood_score) FILTER (
                WHERE recorded_at >= now() - interval '28 days'
                  AND recorded_at < now() - interval '14 days'
            )::numeric, 1)::float AS prior_14d_avg_mood,
            MIN(mood_score)::int AS min_mood,
            MAX(mood_score)::int AS max_mood
        FROM response_entries
        WHERE patient_id = %s AND is_deleted = false
        """,
        (patient_id,),
    ).fetchone()

    recent_moods = connection.execute(
        """
        SELECT 
            re.mood_score,
            re.note,
            re.recorded_at,
            m.name AS module_name,
            m.platform
        FROM response_entries re
        LEFT JOIN sessions s ON s.id = re.session_id
        LEFT JOIN modules m ON m.id = s.module_id
        WHERE re.patient_id = %s AND re.is_deleted = false
        ORDER BY re.recorded_at DESC
        LIMIT 5
        """,
        (patient_id,),
    ).fetchall()

    # 5. Remote Therapeutic Monitoring (RTM) Workflow & Reimbursement (CPT 98980)
    enrollment = connection.execute(
        """
        SELECT status, consent_given, consent_date, enrolled_on, notes
        FROM rtm_enrollments
        WHERE patient_id = %s AND provider_id = %s AND is_deleted = false
        """,
        (patient_id, provider_id),
    ).fetchone()

    rtm_activity = connection.execute(
        """
        SELECT 
            ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)
                FILTER (WHERE activity_type IN ('Review', 'ManagementTime')), 0))::int AS review_minutes_30d,
            COUNT(*) FILTER (WHERE activity_type = 'Review')::int AS review_sessions_count,
            COUNT(*) FILTER (WHERE activity_type = 'Communication')::int AS comms_count,
            COUNT(*) FILTER (WHERE activity_type = 'ManagementTime')::int AS management_count
        FROM rtm_activities
                WHERE patient_id = %s AND provider_id = %s
                    AND started_at >= now() - interval '30 days' AND is_deleted = false
        """,
                (patient_id, provider_id),
    ).fetchone()

    rtm_doc = connection.execute(
        """
        SELECT period_start, period_end, status
        FROM rtm_documentation
        WHERE patient_id = %s AND is_deleted = false
        ORDER BY period_start DESC
        LIMIT 1
        """,
        (patient_id,),
    ).fetchone()

    recent_comms = connection.execute(
        """
        SELECT direction, channel, summary, started_at
        FROM rtm_activities
        WHERE patient_id = %s AND activity_type = 'Communication' AND is_deleted = false
        ORDER BY started_at DESC
        LIMIT 3
        """,
        (patient_id,),
    ).fetchall()

    # 6. Clinical Sessions with Provider (in-person & telehealth)
    clinical_sessions = connection.execute(
        """
        SELECT mode, started_at, ROUND(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)::int AS duration_mins
        FROM clinical_sessions
        WHERE patient_id = %s AND is_deleted = false
        ORDER BY started_at DESC
        LIMIT 4
        """,
        (patient_id,),
    ).fetchall()

    review_mins = rtm_activity["review_minutes_30d"] if rtm_activity else 0

    return {
        "id": str(patient_id),
        "name": patient["name"],
        "age": patient["age"],
        "gender": patient["gender"],
        "medical_history": history,
        "recent_clinical_notes": notes,
        "reflect_app_engagement": {
            **(engagement or {}),
            "top_modules": top_modules,
            "recent_sessions": recent_sessions,
        },
        "therapeutic_response_mood": {
            "scale": "1 (low) to 5 (high)",
            **(mood_summary or {}),
            "recent_mood_checks": recent_moods,
        },
        "rtm_workflow_and_reimbursement": {
            "enrollment": enrollment,
            "cpt_98980_requirement": "20 minutes of review/management per 30-day period",
            "logged_review_minutes_30d": review_mins,
            "threshold_met": review_mins >= 20,
            "documentation_status": rtm_doc["status"] if rtm_doc else "NotStarted",
            "recent_communications": recent_comms,
        },
        "clinical_therapy_sessions": clinical_sessions,
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
                {"selected_patients": records},
                {"type": "patient", "id": records[0]["id"]} if len(records) == 1 else None,
            )

        # Fetch the dashboard metrics in one query instead of three queries per patient.
        summary_rows = connection.execute(
            """
            WITH session_stats AS (
                SELECT s.patient_id,
                       COUNT(*) FILTER (WHERE s.started_at >= now() - interval '30 days')::int AS sessions_30d,
                       COUNT(*) FILTER (WHERE s.started_at >= now() - interval '7 days')::int AS sessions_7d,
                       COUNT(*) FILTER (WHERE s.started_at >= now() - interval '14 days'
                                          AND s.started_at < now() - interval '7 days')::int AS sessions_prev_7d,
                       COUNT(*) FILTER (WHERE m.platform = 'XR')::int AS xr_count,
                       COUNT(*) FILTER (WHERE m.platform = 'Mobile')::int AS mobile_count,
                       MAX(s.started_at) AS last_active
                FROM sessions s
                JOIN modules m ON m.id = s.module_id
                WHERE s.is_deleted = false
                GROUP BY s.patient_id
            ), mood_stats AS (
                SELECT patient_id,
                       COUNT(*) FILTER (
                           WHERE recorded_at >= now() - interval '14 days'
                       )::int AS recent_mood_entries,
                       COUNT(*) FILTER (
                           WHERE recorded_at >= now() - interval '28 days'
                             AND recorded_at < now() - interval '14 days'
                       )::int AS prior_mood_entries,
                       ROUND(AVG(mood_score)::numeric, 1)::float AS average_mood,
                       ROUND(AVG(mood_score) FILTER (
                           WHERE recorded_at >= now() - interval '14 days'
                       )::numeric, 1)::float AS recent_mood,
                       ROUND(AVG(mood_score) FILTER (
                           WHERE recorded_at >= now() - interval '28 days'
                             AND recorded_at < now() - interval '14 days'
                       )::numeric, 1)::float AS prior_mood
                FROM response_entries
                WHERE is_deleted = false
                GROUP BY patient_id
            ), rtm_stats AS (
                                SELECT patient_id, provider_id,
                       ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60), 0))::int AS review_minutes_30d
                FROM rtm_activities
                WHERE started_at >= now() - interval '30 days' AND is_deleted = false
                  AND activity_type IN ('Review', 'ManagementTime')
                                GROUP BY patient_id, provider_id
            ), active_conditions AS (
                SELECT patient_id, array_agg(condition ORDER BY condition) AS conditions
                FROM (
                    SELECT patient_id, condition,
                           ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY date_created DESC) AS position
                    FROM patient_medical_history
                    WHERE status = 'Active' AND is_deleted = false
                ) AS recent_conditions
                WHERE position <= 2
                GROUP BY patient_id
            )
            SELECT p.id, concat_ws(' ', p.first_name, p.last_name) AS name,
                   EXTRACT(YEAR FROM age(current_date, p.date_of_birth))::int AS age,
                   p.gender, COALESCE(ac.conditions, ARRAY[]::text[]) AS active_conditions,
                   COALESCE(ss.sessions_30d, 0) AS sessions_30d,
                   COALESCE(ss.sessions_7d, 0) AS sessions_7d,
                   COALESCE(ss.sessions_prev_7d, 0) AS sessions_prev_7d,
                   COALESCE(ss.xr_count, 0) AS xr_count,
                   COALESCE(ss.mobile_count, 0) AS mobile_count,
                   ss.last_active, ms.average_mood, ms.recent_mood, ms.prior_mood,
                   ms.recent_mood_entries, ms.prior_mood_entries,
                   COALESCE(rs.review_minutes_30d, 0) AS review_minutes_30d
            FROM assignments a
            JOIN patients p ON p.id = a.patient_id
            LEFT JOIN session_stats ss ON ss.patient_id = p.id
            LEFT JOIN mood_stats ms ON ms.patient_id = p.id
            LEFT JOIN rtm_stats rs ON rs.patient_id = p.id AND rs.provider_id = a.provider_id
            LEFT JOIN active_conditions ac ON ac.patient_id = p.id
            WHERE a.provider_id = %s AND a.is_deleted = false AND p.is_deleted = false
            ORDER BY p.last_name, p.first_name
            LIMIT 100
            """,
            (user["id"],),
        ).fetchall()
        summary = [{
            "name": row["name"],
            "active_conditions": row["active_conditions"],
            "sessions_last_30_days": row["sessions_30d"],
            "sessions_last_7_days": row["sessions_7d"],
            "sessions_previous_7_days": row["sessions_prev_7d"],
            "reflect_xr_sessions": row["xr_count"],
            "reflect_mobile_sessions": row["mobile_count"],
            "average_mood_score": row["average_mood"],
            "recent_14_day_mood": row["recent_mood"],
            "prior_14_day_mood": row["prior_mood"],
            "recent_14d_entries": row["recent_mood_entries"],
            "prior_14d_entries": row["prior_mood_entries"],
            "rtm_review_minutes_30d": row["review_minutes_30d"],
            "rtm_20_minute_target_met": row["review_minutes_30d"] >= 20,
            "last_active": row["last_active"],
        } for row in summary_rows]
        return {
            "assigned_patients_overview": summary,
            "patient_names": [p["name"] for p in patients],
            "help_prompt": "Ask about any patient by name to examine their Reflect XR vs Mobile engagement, therapeutic mood responses, or RTM status."
        }, None

    # Admin role
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
        records = []
        for provider in selected:
            # Aggregate stats for this provider's patient panel
            panel_stats = connection.execute(
                """
                SELECT 
                    COUNT(s.id)::int AS panel_total_sessions,
                    COUNT(s.id) FILTER (WHERE m.platform = 'XR')::int AS panel_xr_sessions,
                    COUNT(s.id) FILTER (WHERE m.platform = 'Mobile')::int AS panel_mobile_sessions
                FROM assignments a
                JOIN sessions s ON s.patient_id = a.patient_id
                JOIN modules m ON m.id = s.module_id
                WHERE a.provider_id = %s AND a.is_deleted = false AND s.is_deleted = false
                """,
                (provider["id"],),
            ).fetchone()
            rtm_total = connection.execute(
                """
                SELECT ROUND(COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60), 0))::int AS total_review_mins
                FROM rtm_activities
                WHERE provider_id = %s AND started_at >= now() - interval '30 days' AND is_deleted = false
                """,
                (provider["id"],),
            ).fetchone()
            records.append({
                "id": provider["id"],
                "name": provider["name"],
                "title": provider["title"],
                "specialty": provider["specialty"],
                "active_patient_count": provider["active_patient_count"],
                "panel_session_stats": panel_stats,
                "total_rtm_review_minutes_30d": rtm_total["total_review_mins"] if rtm_total else 0,
            })
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
