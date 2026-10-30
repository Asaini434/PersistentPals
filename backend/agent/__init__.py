from __future__ import annotations

import os
import json
from pathlib import Path
from typing import Callable


class ChatbotConfigurationError(RuntimeError):
    pass


class ChatbotProviderError(RuntimeError):
    pass


def _summarize_records(contexts: list[dict]) -> str:
    """Produce a compact factual response from retrieved records if generation fails."""
    context = next((item for item in reversed(contexts) if item), {})
    patients = context.get("selected_patients", [])
    if patients:
        patient = patients[0]
        name = patient.get("name", "Patient")
        lines = [f"**{name}**"]
        engagement = patient.get("reflect_app_engagement")
        if engagement:
            total = engagement.get("total_sessions")
            xr = engagement.get("reflect_xr_sessions")
            mobile = engagement.get("reflect_mobile_sessions")
            if total is not None and xr is not None and mobile is not None:
                lines.append(f"- App use: {total} sessions (XR {xr}, Mobile {mobile}).")
            sessions = engagement.get("recent_sessions", [])
            if sessions:
                recent = ", ".join(
                    f"{item.get('module', 'Session')} ({item.get('platform', 'platform')}, {item['duration_minutes']} min)"
                    if item.get("duration_minutes") is not None
                    else f"{item.get('module', 'Session')} ({item.get('platform', 'platform')})"
                    for item in sessions[:3]
                )
                lines.append(f"- Recent sessions: {recent}.")
        mood = patient.get("therapeutic_response_mood")
        if mood:
            recent_mood = mood.get("recent_14d_avg_mood")
            overall_mood = mood.get("avg_mood_score")
            entries = mood.get("total_entries")
            if recent_mood is not None:
                lines.append(f"- Mood: {recent_mood}/5 average over the last 14 days.")
            elif overall_mood is not None:
                lines.append(f"- Mood: {overall_mood}/5 overall average; no 14-day average is available.")
            elif entries == 0:
                lines.append("- No mood scores are recorded.")
        rtm = patient.get("rtm_workflow_and_reimbursement")
        if rtm:
            minutes = rtm.get("logged_review_minutes_30d")
            if minutes is not None:
                remaining = max(20 - minutes, 0)
                status = "target met" if remaining == 0 else f"{remaining} min short"
                lines.append(f"- RTM: {minutes}/20 review minutes in the last 30 days ({status}).")
        if len(lines) > 1:
            return "\n".join(lines)

    panel = context.get("assigned_patients_overview")
    if panel:
        lines = [f"**Assigned panel · {len(panel)} patients**"]
        xr_values = [row["reflect_xr_sessions"] for row in panel if isinstance(row.get("reflect_xr_sessions"), (int, float))]
        mobile_values = [row["reflect_mobile_sessions"] for row in panel if isinstance(row.get("reflect_mobile_sessions"), (int, float))]
        if xr_values or mobile_values:
            xr_total = sum(xr_values)
            mobile_total = sum(mobile_values)
            xr_only = sum(bool(row.get("reflect_xr_sessions")) and not row.get("reflect_mobile_sessions") for row in panel)
            mobile_only = sum(bool(row.get("reflect_mobile_sessions")) and not row.get("reflect_xr_sessions") for row in panel)
            mixed = sum(bool(row.get("reflect_mobile_sessions")) and bool(row.get("reflect_xr_sessions")) for row in panel)
            no_sessions = len(panel) - xr_only - mobile_only - mixed
            lines.append(f"- Sessions: **XR {xr_total} · Mobile {mobile_total}**.")
            lines.append(f"- Usage: {xr_only} XR-only · {mobile_only} Mobile-only · {mixed} mixed · {no_sessions} none.")
        else:
            values = [row["sessions_last_30_days"] for row in panel if isinstance(row.get("sessions_last_30_days"), (int, float))]
            if values:
                lines.append(f"- Sessions in the last 30 days: {sum(values)}.")
        for field, label in (
            ("recent_14_day_mood", "recent mood average"),
            ("average_mood_score", "overall mood average"),
        ):
            values = [row[field] for row in panel if isinstance(row.get(field), (int, float))]
            if values:
                lines.append(f"- {label.title()}: {sum(values) / len(values):.1f}/5 across {len(values)} patients.")
        minutes = [row["rtm_review_minutes_30d"] for row in panel if isinstance(row.get("rtm_review_minutes_30d"), (int, float))]
        if minutes:
            met = sum(value >= 20 for value in minutes)
            lines.append(f"- RTM target: {met}/{len(minutes)} patients met 20 minutes in the last 30 days.")
        if len(lines) > 1:
            return "\n".join(lines)

    providers = context.get("providers") or context.get("available_providers")
    if providers:
        names = ", ".join(item.get("name", "Provider") for item in providers[:3])
        remainder = len(providers) - min(len(providers), 3)
        suffix = f", and {remainder} more" if remainder else ""
        return f"**{len(providers)} providers:** {names}{suffix}."

    def flatten(value: object, prefix: str = "") -> list[str]:
        if isinstance(value, dict):
            output = []
            for key, item in value.items():
                normalized_key = str(key).casefold()
                if normalized_key == "id" or normalized_key.endswith("_id"):
                    continue
                label = str(key).replace("_", " ").strip().capitalize()
                output.extend(flatten(item, f"{prefix}{label}: "))
                if len(output) >= 5:
                    break
            return output
        if isinstance(value, list):
            output = []
            for item in value[:3]:
                output.extend(flatten(item, prefix))
                if len(output) >= 5:
                    break
            return output
        if value is None or value == "":
            return []
        if isinstance(value, (str, int, float, bool)):
            return [f"- {prefix}{value}"]
        return []

    details = flatten(context)[:5]
    if details:
        return "**Relevant dashboard data**\n" + "\n".join(details)
    return "No matching dashboard records were found for that request."


def _claims_data_is_missing(answer: str) -> bool:
    normalized = answer.casefold()
    return any(phrase in normalized for phrase in (
        "i don't have enough recorded data",
        "i do not have enough recorded data",
        "not enough data to answer",
        "no data available",
        "no relevant data available",
        "no records are available",
        "no information available",
        "no relevant data was found",
        "couldn't find any records",
    ))


def generate_answer(
    *,
    role: str,
    message: str,
    history: list[dict[str, str]],
    initial_context: dict,
    lookup_data: Callable[[str], tuple[dict, dict | None]],
) -> str:
    """Generate a concise answer using only role-scoped dashboard lookups."""
    provider = os.getenv("CHATBOT_PROVIDER", "ollama").casefold()
    if provider == "ollama":
        base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
        model = os.getenv("OLLAMA_MODEL", "qwen3:4b")
        api_key = "ollama"
    elif provider == "huggingface":
        if os.getenv("CHATBOT_ALLOW_EXTERNAL_PHI", "false").casefold() != "true":
            raise ChatbotConfigurationError(
                "External model use is disabled. Set CHATBOT_ALLOW_EXTERNAL_PHI=true only when approved."
            )
        api_key = os.getenv("HF_TOKEN")
        if not api_key:
            raise ChatbotConfigurationError("Set HF_TOKEN in the backend environment to enable the assistant.")
        base_url = os.getenv("HF_BASE_URL", "https://router.huggingface.co/v1")
        model = os.getenv("HF_MODEL", "Qwen/Qwen3-4B-Instruct-2507:fastest")
    else:
        raise ChatbotConfigurationError("CHATBOT_PROVIDER must be 'ollama' or 'huggingface'.")

    from openai import APIStatusError, APIConnectionError, OpenAI

    system_instructions = Path(__file__).with_name("system.txt").read_text(encoding="utf-8")
    if provider == "ollama":
        system_instructions = f"/no_think\n{system_instructions}"
    system_message = f"{system_instructions}\n\nAUTHENTICATED_USER_ROLE: {role}"
    messages = [{"role": "system", "content": system_message}]
    messages.extend(history[-10:])
    messages.append({
        "role": "user",
        "content": (
            f"USER_QUESTION:\n{message}\n\n"
            f"RELEVANT_DASHBOARD_RECORDS:\n{json.dumps(initial_context, default=str)}"
        ),
    })
    retrieved_contexts = [initial_context]

    tools = [{
        "type": "function",
        "function": {
            "name": "lookup_dashboard_data",
            "description": (
                "Retrieve dashboard records relevant to the user's question. "
                "Access is automatically restricted to the authenticated user's role and assignments."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "A focused natural-language request for the relevant patient, provider, or panel data.",
                    }
                },
                "required": ["query"],
                "additionalProperties": False,
            },
            "strict": True,
        },
    }]

    try:
        client = OpenAI(
            base_url=base_url,
            api_key=api_key,
        )
        request_kwargs = {
            "model": model,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "temperature": 0.2,
            "max_tokens": 600,
        }
        if provider == "ollama":
            request_kwargs["extra_body"] = {"think": False}
        response = client.chat.completions.create(**request_kwargs)
        lookup_count = 0
        while response.choices[0].message.tool_calls:
            assistant_message = response.choices[0].message
            messages.append(assistant_message.model_dump(exclude_none=True))
            for tool_call in assistant_message.tool_calls:
                if tool_call.function.name != "lookup_dashboard_data":
                    tool_result = {"error": "Unsupported tool."}
                elif lookup_count >= 3:
                    tool_result = {"error": "Lookup limit reached. Answer with the data already retrieved."}
                else:
                    try:
                        arguments = json.loads(tool_call.function.arguments)
                        query = arguments.get("query", "").strip()
                        if not query:
                            tool_result = {"error": "A focused lookup query is required."}
                        else:
                            records, _target = lookup_data(query)
                            retrieved_contexts.append(records)
                            tool_result = {"records": records}
                            lookup_count += 1
                    except (json.JSONDecodeError, AttributeError, TypeError):
                        tool_result = {"error": "Invalid lookup arguments."}
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(tool_result, default=str),
                })
            response = client.chat.completions.create(**request_kwargs)
    except APIConnectionError as error:
        if provider == "ollama":
            raise ChatbotProviderError(
                f"Cannot reach local Ollama at {base_url}. Start Ollama and ensure '{model}' is installed."
            ) from error
        raise ChatbotProviderError("Cannot reach the Hugging Face inference service.") from error
    except APIStatusError as error:
        if provider == "ollama":
            raise ChatbotProviderError(
                f"Local Ollama request failed with HTTP {error.status_code}. Make sure Ollama is running and '{model}' is installed."
            ) from error
        if error.status_code == 402:
            raise ChatbotConfigurationError(
                "Hugging Face Inference Providers has no remaining credits. Add credits or enable an eligible plan, then retry."
            ) from error
        if error.status_code in {401, 403}:
            raise ChatbotConfigurationError(
                "Hugging Face rejected the token or it lacks Inference Providers permission."
            ) from error
        if error.status_code == 400:
            raise ChatbotConfigurationError(
                "Hugging Face rejected the configured model or request. Verify HF_MODEL and provider availability."
            ) from error
        raise ChatbotProviderError(
            f"Hugging Face inference request failed with HTTP {error.status_code}."
        ) from error
    except Exception as error:
        raise ChatbotProviderError("The AI assistant could not answer right now.") from error

    import re

    answer = response.choices[0].message.content or ""
    answer = re.sub(r"<think>.*?</think>", "", answer, flags=re.DOTALL).strip()
    if answer and not (initial_context and _claims_data_is_missing(answer)):
        return answer

    if initial_context:
        retry_messages = [
            {
                "role": "system",
                "content": (
                    f"You are a concise {role} dashboard assistant. Answer from the supplied records only. "
                    "If a relevant value is present, report it directly. If one requested field is absent, "
                    "state only that field is unavailable. Never narrate reasoning or claim all data is missing."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Question: {message}\nRelevant records: "
                    f"{json.dumps(initial_context, default=str)}"
                ),
            },
        ]
        retry_kwargs = {
            "model": model,
            "messages": retry_messages,
            "temperature": 0.1,
            "max_tokens": 1200,
        }
        if provider == "ollama":
            retry_kwargs["extra_body"] = {"think": False}
        retry_response = client.chat.completions.create(**retry_kwargs)
        retry_answer = retry_response.choices[0].message.content or ""
        retry_answer = re.sub(r"<think>.*?</think>", "", retry_answer, flags=re.DOTALL).strip()
        if retry_answer and not (initial_context and _claims_data_is_missing(retry_answer)):
            return retry_answer

    return _summarize_records(retrieved_contexts)
