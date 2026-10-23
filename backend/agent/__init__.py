from __future__ import annotations

import os
from pathlib import Path


class ChatbotConfigurationError(RuntimeError):
    pass


class ChatbotProviderError(RuntimeError):
    pass


def generate_answer(
    *,
    role: str,
    message: str,
    context: dict,
    history: list[dict[str, str]],
) -> str:
    """Generate a response grounded only in role-scoped database context."""
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
    system_message = f"{system_instructions}\n\nAUTHENTICATED_USER_ROLE: {role}"
    messages = [{"role": "system", "content": system_message}]
    messages.extend(history[-10:])
    messages.append(
        {
            "role": "user",
            "content": f"DATABASE_CONTEXT:\n{context}\n\nUSER_QUESTION:\n{message}",
        }
    )

    try:
        client = OpenAI(
            base_url=base_url,
            api_key=api_key,
        )
        request_kwargs = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 1500,
        }
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
    if not answer.strip() and getattr(response.choices[0].message, "reasoning", None):
        answer = response.choices[0].message.reasoning or ""
    answer = re.sub(r"<think>.*?</think>", "", answer, flags=re.DOTALL).strip()
    return answer if answer else "I couldn't form an answer from the available records."
