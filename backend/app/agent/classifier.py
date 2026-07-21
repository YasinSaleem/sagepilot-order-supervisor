import json
import logging
from typing import Any, Dict
from openai import AsyncOpenAI

from app.config import settings
from app.agent.prompts import CLASSIFIER_PROMPT

logger = logging.getLogger("agent-classifier")


async def classify_incoming_event(
    event_type: str,
    payload: Dict[str, Any],
    wake_policy: Dict[str, Any],
    base_instruction: str,
) -> Dict[str, Any]:
    """Classifies an incoming event. Checks allow-list first, otherwise calls OpenRouter LLM."""
    auto_wake_types = wake_policy.get("auto_wake_event_types", [])

    # Terminal lifecycle events ALWAYS wake up the main supervisor to close the workflow
    TERMINAL_EVENTS = ["delivered", "order_delivered", "order_cancelled", "order_completed", "close_order"]
    if event_type in auto_wake_types or event_type in TERMINAL_EVENTS:
        return {
            "should_wake": True,
            "reason": f"Event '{event_type}' matched supervisor auto-wake allow-list or terminal lifecycle event.",
            "bypassed_llm": True,
        }

    api_key = settings.OPENROUTER_API_KEY or settings.OPENAI_API_KEY
    model = settings.OPENROUTER_MODEL or settings.DEFAULT_MODEL

    # Step 2: Fallback to heuristic classifier if no API key provided
    if not api_key:
        is_critical = event_type in ["payment_failed", "shipment_delayed", "refund_requested", "customer_message_received"]
        return {
            "should_wake": is_critical,
            "reason": f"Heuristic classifier decision (No OpenRouter API key set). Critical={is_critical}",
            "bypassed_llm": False,
        }

    try:
        client = AsyncOpenAI(
            api_key=api_key,
            base_url=settings.OPENROUTER_BASE_URL,
        )
        prompt = CLASSIFIER_PROMPT.format(
            base_instruction=base_instruction,
            event_type=event_type,
            payload=json.dumps(payload),
        )
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.0,
        )
        content = response.choices[0].message.content or "{}"
        data = json.loads(content)
        return {
            "should_wake": bool(data.get("should_wake", True)),
            "reason": str(data.get("reason", "Classifier decision")),
            "bypassed_llm": False,
        }
    except Exception as e:
        logger.warning(f"Error in OpenRouter classification, defaulting to wake: {e}")
        return {
            "should_wake": True,
            "reason": f"Classifier error fallback wake: {e}",
            "bypassed_llm": False,
        }
