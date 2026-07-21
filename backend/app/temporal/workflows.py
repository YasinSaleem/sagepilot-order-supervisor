import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from app.temporal.activities import (
        update_run_status,
        archive_timeline_events,
        record_action_log,
        persist_final_output,
        classify_event_activity,
        run_agent_cycle_activity,
        generate_end_of_run_learnings_activity,
    )


@dataclass
class WorkflowInput:
    run_id: str
    order_id: str
    supervisor_id: str
    supervisor_config: Dict[str, Any]
    run_instructions: List[str] = field(default_factory=list)
    memory_summary: str = "Order workflow initialized. Awaiting initial order activity."
    timeline: List[Dict[str, Any]] = field(default_factory=list)


@workflow.defn
class OrderSupervisorWorkflow:
    def __init__(self) -> None:
        self._run_id: str = ""
        self._order_id: str = ""
        self._supervisor_id: str = ""
        self._supervisor_config: Dict[str, Any] = {}
        
        self._status: str = "RUNNING"  # RUNNING, WAKING, SLEEPING, PAUSED, COMPLETED, TERMINATED
        self._memory_summary: str = ""
        self._run_instructions: List[str] = []
        self._timeline: List[Dict[str, Any]] = []
        self._pending_events: List[Dict[str, Any]] = []
        
        self._next_wakeup_at: Optional[datetime] = None
        self._is_interrupted: bool = False
        self._is_completed: bool = False
        self._is_terminated: bool = False
        self._final_output: Optional[Dict[str, Any]] = None

    @workflow.signal
    async def receive_event(self, event: Dict[str, Any]) -> None:
        """Signal handler for incoming order events."""
        event_copy = dict(event)
        if "timestamp" not in event_copy:
            event_copy["timestamp"] = workflow.now().isoformat()
        self._pending_events.append(event_copy)

    @workflow.signal
    async def add_instruction(self, instruction: str) -> None:
        """Signal handler to add run-specific instruction dynamically."""
        if instruction and instruction not in self._run_instructions:
            self._run_instructions.append(instruction)
            self._timeline.append({
                "event_type": "INSTRUCTION_ADDED",
                "payload": {"instruction": instruction},
                "source": "USER",
                "timestamp": workflow.now().isoformat(),
            })

    @workflow.signal
    async def interrupt_run(self) -> None:
        """Signal handler to pause/interrupt workflow execution."""
        self._is_interrupted = True
        self._status = "PAUSED"
        self._timeline.append({
            "event_type": "WORKFLOW_PAUSED",
            "payload": {"reason": "User requested pause/interrupt"},
            "source": "USER",
            "timestamp": workflow.now().isoformat(),
        })

    @workflow.signal
    async def resume_run(self) -> None:
        """Signal handler to resume workflow execution."""
        self._is_interrupted = False
        self._status = "RUNNING"
        self._timeline.append({
            "event_type": "WORKFLOW_RESUMED",
            "payload": {"reason": "User requested resume"},
            "source": "USER",
            "timestamp": workflow.now().isoformat(),
        })

    @workflow.signal
    async def terminate_run(self) -> None:
        """Signal handler to terminate workflow run."""
        self._is_terminated = True
        self._status = "TERMINATED"
        self._timeline.append({
            "event_type": "WORKFLOW_TERMINATED",
            "payload": {"reason": "User requested termination"},
            "source": "USER",
            "timestamp": workflow.now().isoformat(),
        })

    @workflow.query
    def get_state(self) -> Dict[str, Any]:
        """Query handler to fetch current live runtime state."""
        return {
            "run_id": self._run_id,
            "order_id": self._order_id,
            "supervisor_id": self._supervisor_id,
            "status": self._status,
            "next_wakeup_at": self._next_wakeup_at.isoformat() if self._next_wakeup_at else None,
            "memory_summary": self._memory_summary,
            "run_instructions": self._run_instructions,
            "timeline": self._timeline,
            "pending_events_count": len(self._pending_events),
            "is_interrupted": self._is_interrupted,
            "is_completed": self._is_completed,
            "final_output": self._final_output,
        }

    async def _manage_timeline_bounds(self) -> None:
        """Bounded sliding window: keep last 10 in memory, write evicted to Postgres."""
        if len(self._timeline) > 10:
            evicted = self._timeline[:-10]
            self._timeline = self._timeline[-10:]
            await workflow.execute_activity(
                archive_timeline_events,
                args=[self._run_id, evicted],
                start_to_close_timeout=timedelta(seconds=10),
            )

    async def _sync_postgres_status(self) -> None:
        """Fire update_run_status activity to sync denormalized columns in Postgres."""
        next_wakeup_str = self._next_wakeup_at.isoformat() if self._next_wakeup_at else None
        await workflow.execute_activity(
            update_run_status,
            args=[self._run_id, self._status, next_wakeup_str],
            start_to_close_timeout=timedelta(seconds=10),
        )

    @workflow.run
    async def run(self, input_data: WorkflowInput) -> Dict[str, Any]:
        self._run_id = input_data.run_id
        self._order_id = input_data.order_id
        self._supervisor_id = input_data.supervisor_id
        self._supervisor_config = input_data.supervisor_config
        self._run_instructions = list(input_data.run_instructions)
        self._memory_summary = input_data.memory_summary
        self._timeline = list(input_data.timeline)

        # Log start event
        if not self._timeline:
            self._timeline.append({
                "event_type": "order_created",
                "payload": {"order_id": self._order_id},
                "source": "SYSTEM",
                "timestamp": workflow.now().isoformat(),
            })

        await self._sync_postgres_status()

        while not self._is_completed and not self._is_terminated:
            # Handle paused / interrupted state
            if self._is_interrupted:
                await self._sync_postgres_status()
                await workflow.wait_condition(
                    lambda: (not self._is_interrupted) or self._is_completed or self._is_terminated
                )
                if self._is_completed or self._is_terminated:
                    break

            # Evaluate wake triggers
            wake_reason = None
            if self._pending_events:
                wake_reason = "INCOMING_SIGNAL"
            elif self._next_wakeup_at and workflow.now() >= self._next_wakeup_at:
                wake_reason = "SCHEDULED_TIMER"
            elif self._status == "RUNNING":
                wake_reason = "WORKFLOW_START"

            if wake_reason:
                self._status = "WAKING"
                await self._sync_postgres_status()

                # Process pending events
                events_to_process = list(self._pending_events)
                self._pending_events.clear()

                for ev in events_to_process:
                    self._timeline.append(ev)

                await self._manage_timeline_bounds()

                # Check auto-wake allowlist or invoke classifier / agent
                auto_wake_list = self._supervisor_config.get("wake_policy", {}).get(
                    "auto_wake_event_types", []
                )
                should_agent_run = True  # Default wake on start/timer

                if wake_reason == "INCOMING_SIGNAL" and events_to_process:
                    # Check if any event matches allow-list
                    has_auto_wake = any(
                        ev.get("event_type") in auto_wake_list for ev in events_to_process
                    )
                    if has_auto_wake:
                        should_agent_run = True
                    else:
                        # Call classifier activity for non-allow-listed incoming event
                        first_ev = events_to_process[0]
                        classifier_res = await workflow.execute_activity(
                            classify_event_activity,
                            args=[
                                first_ev.get("event_type", ""),
                                first_ev.get("payload", {}),
                                self._supervisor_config.get("wake_policy", {}),
                                self._supervisor_config.get("base_instruction", ""),
                            ],
                            start_to_close_timeout=timedelta(seconds=15),
                        )
                        should_agent_run = classifier_res.get("should_wake", True)

                if should_agent_run:
                    # Execute Agent Cycle Activity
                    agent_res = await workflow.execute_activity(
                        run_agent_cycle_activity,
                        args=[{
                            "run_id": self._run_id,
                            "order_id": self._order_id,
                            "base_instruction": self._supervisor_config.get("base_instruction", "Supervise order."),
                            "run_instructions": self._run_instructions,
                            "memory_summary": self._memory_summary,
                            "recent_timeline": self._timeline[-5:],
                            "model_config": self._supervisor_config.get("model_config_data", {}),
                        }],
                        start_to_close_timeout=timedelta(seconds=30),
                    )

                    self._memory_summary = agent_res.get("updated_memory_summary", self._memory_summary)
                    control_act = agent_res.get("control_action", {})

                    if control_act.get("type") == "close_workflow":
                        self._is_completed = True
                    elif control_act.get("type") == "schedule_next_wakeup":
                        delay_sec = int(control_act.get("delay_seconds", 3600))
                        self._next_wakeup_at = workflow.now() + timedelta(seconds=max(5, delay_sec))

                    await self._manage_timeline_bounds()

                self._status = "SLEEPING"
                await self._sync_postgres_status()

            # Continue-as-new check for history bounds
            if workflow.info().is_continue_as_new_suggested():
                await self._manage_timeline_bounds()
                workflow.continue_as_new(
                    WorkflowInput(
                        run_id=self._run_id,
                        order_id=self._order_id,
                        supervisor_id=self._supervisor_id,
                        supervisor_config=self._supervisor_config,
                        run_instructions=self._run_instructions,
                        memory_summary=self._memory_summary,
                        timeline=self._timeline,
                    )
                )

            # Sleeping behavior: wait until timer expiry or new event signal arrives
            sleep_timeout = None
            if self._next_wakeup_at and self._next_wakeup_at > workflow.now():
                sleep_duration = self._next_wakeup_at - workflow.now()
                sleep_timeout = sleep_duration.total_seconds()
            else:
                sleep_timeout = 3600  # Default 1 hour fallback

            # Wait for signal or timer
            try:
                await workflow.wait_condition(
                    lambda: bool(self._pending_events) or self._is_interrupted or self._is_completed or self._is_terminated,
                    timeout=timedelta(seconds=max(1.0, sleep_timeout)),
                )
            except asyncio.TimeoutError:
                pass

        # Finalize run upon completion or termination
        final_status = "COMPLETED" if self._is_completed else "TERMINATED"
        learnings_output = await workflow.execute_activity(
            generate_end_of_run_learnings_activity,
            args=[{
                "order_id": self._order_id,
                "final_status": final_status,
                "memory_summary": self._memory_summary,
                "run_instructions": self._run_instructions,
                "timeline": self._timeline,
                "completed_at": workflow.now().isoformat(),
            }],
            start_to_close_timeout=timedelta(seconds=20),
        )

        self._final_output = {
            "final_status": final_status,
            "memory_summary": self._memory_summary,
            "run_instructions": self._run_instructions,
            "total_timeline_events": len(self._timeline),
            "completed_at": workflow.now().isoformat(),
            "learnings_report": learnings_output,
        }

        await workflow.execute_activity(
            persist_final_output,
            args=[self._run_id, final_status, self._final_output],
            start_to_close_timeout=timedelta(seconds=10),
        )

        return self._final_output
