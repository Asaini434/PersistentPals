from __future__ import annotations

import json

from psycopg import Connection

from agent import ChatbotConfigurationError, ChatbotProviderError, generate_answer
from agent.tool_functions import get_chat_context


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

    context, target = get_chat_context(
        connection,
        user,
        message,
        previous["target_id"] if previous else None,
    )
    answer = generate_answer(
        role=user["role"],
        message=message,
        context=context,
        history=history,
    )

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
            json.dumps({"target": target_metadata, "records": context}, default=str),
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