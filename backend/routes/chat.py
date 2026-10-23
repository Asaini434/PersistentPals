from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator
from psycopg import Connection

from agent.main_agent import (
    ChatbotConfigurationError,
    ChatbotProviderError,
    answer_message,
)
from .auth import get_current_user, require_role
from .database import get_connection

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)

    @field_validator("message")
    @classmethod
    def require_nonblank_message(cls, message: str) -> str:
        message = message.strip()
        if not message:
            raise ValueError("Message cannot be blank.")
        return message


@router.get("/messages")
def get_messages(
    limit: int = Query(default=30, ge=1, le=100),
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> list[dict]:
    require_role(user, "admin", "provider")
    rows = connection.execute(
        """
        SELECT id, sender, content, date_created
        FROM (
            SELECT id, sender, content, date_created
            FROM chat_messages
            WHERE user_id = %s AND is_deleted = false
            ORDER BY date_created DESC
            LIMIT %s
        ) AS recent
        ORDER BY date_created
        """,
        (user["id"], limit),
    ).fetchall()
    return [
        {
            "id": str(row["id"]),
            "sender": row["sender"],
            "content": row["content"],
            "date_created": row["date_created"],
        }
        for row in rows
    ]


@router.post("/messages", status_code=201)
def post_message(
    payload: ChatMessageRequest,
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> dict:
    require_role(user, "admin", "provider")
    try:
        return answer_message(connection, user, payload.message)
    except ChatbotConfigurationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ChatbotProviderError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.delete("/messages", status_code=204)
def clear_messages(
    user: dict[str, str] = Depends(get_current_user),
    connection: Connection = Depends(get_connection),
) -> Response:
    require_role(user, "admin", "provider")
    connection.execute(
        """
        UPDATE chat_messages
        SET is_deleted = true, date_deleted = now()
        WHERE user_id = %s AND is_deleted = false
        """,
        (user["id"],),
    )
    return Response(status_code=204)