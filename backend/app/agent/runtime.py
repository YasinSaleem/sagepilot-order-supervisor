import json
import logging
from typing import Any, Dict, List
from openai import AsyncOpenAI

from app.config import settings
from app.agent.prompts import SYSTEM_SUPERVISOR_PROMPT, LEARNINGS_PROMPT
from app.agent.tools import AGENT_TOOLS_SCHEMA, execute_side_effect_tool

logger = logging.getLogger("agent-runtime")


async def run_agent_inference_cycle(context: Dict[str, Any]) -> Dict[str, Any]:
    """Runs one reasoning and tool execution cycle for the order supervisor via OpenRouter."""
    run_id = context.get("run_id", "")
    order_id = context.get("order_id", "")
    base_instruction = context.get("base_instruction", "Supervise order lifecycle.")
    run_instructions = context.get("run_instructions", [])
    memory_summary = context.get("memory_summary", "Order active.")
    recent_timeline = context.get("recent_timeline", [])
    model_config = context.get("model_config", {})

    api_key = settings.OPENROUTER_API_KEY or settings.OPENAI_API_KEY
    model = model_config.get("model") or settings.OPENROUTER_MODEL or settings.DEFAULT_MODEL

    run_instructions_text = "\n".join([f"- {inst}" for inst in run_instructions]) if run_instructions else "None"
    recent_timeline_text = "\n".join([f"- [{ev.get('timestamp')}] {ev.get('event_type')}: {ev.get('payload')}" for ev in recent_timeline]) if recent_timeline else "None"

    system_prompt = SYSTEM_SUPERVISOR_PROMPT.format(
        base_instruction=base_instruction,
        run_instructions_text=run_instructions_text,
        memory_summary=memory_summary,
        recent_timeline_text=recent_timeline_text,
    )

    tool_calls_executed = []
    control_action = {"type": "schedule_next_wakeup", "delay_seconds": 3600, "reason": "Default routine check."}

    # Fallback execution when OpenRouter API Key is not set
    if not api_key:
        logger.info("OPENROUTER_API_KEY not set; executing mock deterministic agent cycle.")
        # Check if terminal event occurred in timeline
        has_delivered = any(ev.get("event_type") == "delivered" for ev in recent_timeline)
        if has_delivered:
            control_action = {"type": "close_workflow", "final_status": "COMPLETED", "summary": f"Order {order_id} delivered successfully."}
            tool_calls_executed.append({
                "tool_name": "create_internal_note",
                "args": {"note": f"Order {order_id} marked complete post delivery."},
                "output": {"status": "RECORDED"},
            })
        else:
            # Check for delay or failure
            has_failure = any(ev.get("event_type") in ["payment_failed", "shipment_delayed"] for ev in recent_timeline)
            if has_failure:
                tool_calls_executed.append({
                    "tool_name": "escalate_issue",
                    "args": {"reason": f"Issue detected on order {order_id}", "severity": "HIGH"},
                    "output": {"status": "ESCALATED", "ticket_id": "TICK-HIGH-101"},
                })
                tool_calls_executed.append({
                    "tool_name": "send_customer_message",
                    "args": {"message": f"We are investigating an update for your order {order_id}."},
                    "output": {"status": "SENT"},
                })
                control_action = {"type": "schedule_next_wakeup", "delay_seconds": 1800, "reason": "Re-check issue status in 30 mins."}

        updated_memory = f"Supervisor evaluated order {order_id}. Executed tools: {[t['tool_name'] for t in tool_calls_executed]}. Control: {control_action['type']}."
        return {
            "tool_calls": tool_calls_executed,
            "control_action": control_action,
            "updated_memory_summary": updated_memory,
        }

    # OpenRouter API call with OpenAI-compatible function/tool calling
    try:
        client = AsyncOpenAI(
            api_key=api_key,
            base_url=settings.OPENROUTER_BASE_URL,
        )
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Review order {order_id} state and take required actions."},
            ],
            tools=AGENT_TOOLS_SCHEMA,
            tool_choice="auto",
        )

        message = response.choices[0].message
        if message.tool_calls:
            for tc in message.tool_calls:
                fn_name = tc.function.name
                fn_args = json.loads(tc.function.arguments or "{}")

                if fn_name in ["schedule_next_wakeup", "close_workflow"]:
                    control_action = {"type": fn_name, **fn_args}
                else:
                    output = execute_side_effect_tool(fn_name, fn_args)
                    tool_calls_executed.append({
                        "tool_name": fn_name,
                        "args": fn_args,
                        "output": output,
                    })

        executed_tools_list = [t['tool_name'] for t in tool_calls_executed]
        if executed_tools_list:
            actions_summary = f"Executed actions: {', '.join(executed_tools_list)}."
        else:
            actions_summary = "No side-effect actions required."

        wakeup_delay = control_action.get('delay_seconds', 3600)
        control_summary = f"Control: {control_action.get('type', 'schedule_next_wakeup')} (Next check in {wakeup_delay}s)."

        if message.content and message.content.strip():
            reasoning_summary = message.content.strip()
            updated_memory = f"{reasoning_summary} {actions_summary} {control_summary}"
        else:
            last_event = recent_timeline[-1].get("event_type") if recent_timeline else "order review"
            updated_memory = f"Evaluated order {order_id} following '{last_event}'. {actions_summary} {control_summary}"

        return {
            "tool_calls": tool_calls_executed,
            "control_action": control_action,
            "updated_memory_summary": updated_memory,
        }
    except Exception as e:
        logger.error(f"Error in OpenRouter inference cycle: {e}")
        return {
            "tool_calls": [],
            "control_action": {"type": "schedule_next_wakeup", "delay_seconds": 3600, "reason": f"Fallback error recovery: {e}"},
            "updated_memory_summary": f"Memory retained. Error in agent cycle: {e}",
        }


async def generate_end_of_run_learnings(context: Dict[str, Any]) -> Dict[str, Any]:
    """Generates final summary, key learnings, and recommendations via OpenRouter when run finishes."""
    order_id = context.get("order_id", "")
    final_status = context.get("final_status", "COMPLETED")
    memory_summary = context.get("memory_summary", "")
    run_instructions = context.get("run_instructions", [])
    timeline = context.get("timeline", [])

    api_key = settings.OPENROUTER_API_KEY or settings.OPENAI_API_KEY
    model = settings.OPENROUTER_MODEL or settings.DEFAULT_MODEL

    run_instructions_text = "\n".join([f"- {i}" for i in run_instructions]) if run_instructions else "None"
    timeline_text = "\n".join([f"- {ev.get('event_type')}" for ev in timeline]) if timeline else "None"

    if not api_key:
        return {
            "final_summary": f"Order {order_id} supervisor workflow concluded with status {final_status}.",
            "key_actions_taken": ["Automated status sync", "Timeline event archival", "Final output storage"],
            "learnings": [
                f"Order {order_id} resolved under base supervisor guidance.",
                "Temporal sleeping and wake-up timers ensured efficient resource consumption.",
            ],
            "recommendations": [
                "Maintain default wake policies for similar high-volume orders.",
                "Review internal note logs for fulfillment optimization.",
            ],
            "completed_at": context.get("completed_at", ""),
        }

    try:
        client = AsyncOpenAI(
            api_key=api_key,
            base_url=settings.OPENROUTER_BASE_URL,
        )
        prompt = LEARNINGS_PROMPT.format(
            order_id=order_id,
            final_status=final_status,
            memory_summary=memory_summary,
            run_instructions_text=run_instructions_text,
            timeline_text=timeline_text,
        )
        response = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        return json.loads(response.choices[0].message.content or "{}")
    except Exception as e:
        logger.warning(f"Error generating OpenRouter learnings: {e}")
        return {
            "final_summary": f"Order {order_id} ended with status {final_status}.",
            "key_actions_taken": ["Workflow termination"],
            "learnings": ["Successful execution"],
            "recommendations": ["No recommendations"],
        }
