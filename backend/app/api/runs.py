import uuid
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.domain import Supervisor, OrderRun, TimelineEvent, ActionLog
from app.models.schemas import (
    RunCreate,
    RunEventInject,
    RunInstructionAdd,
    RunResponse,
)
from app.temporal.client import temporal_client_manager

router = APIRouter(prefix="/runs", tags=["Order Workflow Runs"])


@router.post("", response_model=RunResponse, status_code=status.HTTP_201_CREATED)
async def start_order_run(
    payload: RunCreate, db: AsyncSession = Depends(get_db)
):
    """Launch a long-running Temporal order supervisor workflow."""
    # 1. Fetch supervisor template
    stmt = select(Supervisor).where(Supervisor.id == payload.supervisor_id)
    sup = (await db.execute(stmt)).scalar_one_or_none()
    if not sup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Supervisor configuration '{payload.supervisor_id}' not found",
        )

    run_id = f"run-{uuid.uuid4().hex[:12]}"
    
    # 2. Insert record in Supabase Postgres
    order_run = OrderRun(
        id=run_id,
        order_id=payload.order_id,
        supervisor_id=payload.supervisor_id,
        status="RUNNING",
    )
    db.add(order_run)
    await db.commit()
    await db.refresh(order_run)

    # 3. Start Temporal workflow
    sup_config = {
        "base_instruction": sup.base_instruction,
        "available_tools": sup.available_tools,
        "wake_policy": sup.wake_policy,
        "model_config_data": sup.model_config_data,
    }

    try:
        await temporal_client_manager.start_order_workflow(
            run_id=run_id,
            order_id=payload.order_id,
            supervisor_id=payload.supervisor_id,
            supervisor_config=sup_config,
            initial_instructions=payload.initial_instructions,
        )
    except Exception:
        pass

    return RunResponse(
        id=order_run.id,
        order_id=order_run.order_id,
        supervisor_id=order_run.supervisor_id,
        status=order_run.status,
        next_wakeup_at=order_run.next_wakeup_at,
        final_output=order_run.final_output,
        created_at=order_run.created_at,
        updated_at=order_run.updated_at,
        memory_summary=None,
        run_instructions=[payload.initial_instructions] if payload.initial_instructions else [],
        timeline_events=[],
    )


@router.get("", response_model=List[RunResponse])
async def list_order_runs(db: AsyncSession = Depends(get_db)):
    """List all active and completed order runs (with live state sync for active runs)."""
    stmt = select(OrderRun).order_by(OrderRun.created_at.desc())
    result = await db.execute(stmt)
    runs = result.scalars().all()

    response_list = []
    for r in runs:
        next_wakeup = r.next_wakeup_at
        status_str = r.status

        # Query live state for active runs to guarantee next_wakeup_at accuracy on dashboard
        if status_str in ["RUNNING", "WAKING", "SLEEPING", "PAUSED"]:
            live_state = await temporal_client_manager.query_workflow_state(r.id)
            if live_state:
                status_str = live_state.get("status", status_str)
                if live_state.get("next_wakeup_at"):
                    try:
                        from datetime import datetime
                        next_wakeup = datetime.fromisoformat(live_state["next_wakeup_at"])
                    except Exception:
                        pass

        response_list.append(
            RunResponse(
                id=r.id,
                order_id=r.order_id,
                supervisor_id=r.supervisor_id,
                status=status_str,
                next_wakeup_at=next_wakeup,
                final_output=r.final_output,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
        )
    return response_list


@router.get("/{run_id}", response_model=RunResponse)
async def get_order_run_details(run_id: str, db: AsyncSession = Depends(get_db)):
    """
    Fetch order run details:
    1. Reads base record from Supabase Postgres.
    2. Queries live state directly from Temporal via get_state() query if active.
    3. Falls back to persisted Postgres data if completed or past Temporal retention.
    """
    stmt = select(OrderRun).where(OrderRun.id == run_id)
    order_run = (await db.execute(stmt)).scalar_one_or_none()
    if not order_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order run '{run_id}' not found",
        )

    response_dict = {
        "id": order_run.id,
        "order_id": order_run.order_id,
        "supervisor_id": order_run.supervisor_id,
        "status": order_run.status,
        "next_wakeup_at": order_run.next_wakeup_at,
        "final_output": order_run.final_output,
        "created_at": order_run.created_at,
        "updated_at": order_run.updated_at,
        "memory_summary": None,
        "run_instructions": None,
        "timeline_events": None,
    }

    # Attempt fetching live runtime state directly from Temporal get_state() query
    live_state = await temporal_client_manager.query_workflow_state(run_id)
    if live_state:
        response_dict["status"] = live_state.get("status", order_run.status)
        response_dict["memory_summary"] = live_state.get("memory_summary")
        response_dict["run_instructions"] = live_state.get("run_instructions")
        response_dict["timeline_events"] = live_state.get("timeline")
        if live_state.get("next_wakeup_at"):
            try:
                from datetime import datetime
                response_dict["next_wakeup_at"] = datetime.fromisoformat(live_state["next_wakeup_at"])
            except Exception:
                pass
    else:
        # Fallback to persisted DB history if workflow completed/terminated or off Temporal retention
        if order_run.final_output:
            response_dict["memory_summary"] = order_run.final_output.get("memory_summary")
            response_dict["run_instructions"] = order_run.final_output.get("run_instructions")

        # Fetch archived timeline events from Postgres
        events_stmt = (
            select(TimelineEvent)
            .where(TimelineEvent.run_id == run_id)
            .order_by(TimelineEvent.timestamp.asc())
        )
        archived_events = (await db.execute(events_stmt)).scalars().all()
        response_dict["timeline_events"] = [
            {
                "event_type": ev.event_type,
                "payload": ev.payload,
                "source": ev.source,
                "timestamp": ev.timestamp.isoformat() if ev.timestamp else None,
            }
            for ev in archived_events
        ]

    # Always fetch executed tool action logs from Postgres
    actions_stmt = (
        select(ActionLog)
        .where(ActionLog.run_id == run_id)
        .order_by(ActionLog.timestamp.desc())
    )
    db_actions = (await db.execute(actions_stmt)).scalars().all()
    response_dict["action_logs"] = [
        {
            "id": a.id,
            "tool_name": a.tool_name,
            "tool_input": a.tool_input,
            "tool_output": a.tool_output,
            "timestamp": a.timestamp.isoformat() if a.timestamp else None,
        }
        for a in db_actions
    ]

    return RunResponse(**response_dict)


@router.post("/{run_id}/events", status_code=status.HTTP_200_OK)
async def inject_event_signal(
    run_id: str, payload: RunEventInject, db: AsyncSession = Depends(get_db)
):
    """Inject an event signal into a running Temporal order workflow."""
    event_dict = {
        "event_type": payload.event_type,
        "payload": payload.payload,
        "source": payload.source,
    }
    try:
        await temporal_client_manager.send_event_signal(run_id, event_dict)
        return {"status": "SIGNAL_SENT", "event_type": payload.event_type}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send event signal to workflow '{run_id}': {e}",
        )


@router.post("/{run_id}/instructions", status_code=status.HTTP_200_OK)
async def add_run_instruction_signal(
    run_id: str, payload: RunInstructionAdd, db: AsyncSession = Depends(get_db)
):
    """Append a dynamic run instruction signal to a live order workflow."""
    try:
        await temporal_client_manager.send_instruction_signal(run_id, payload.instruction)
        return {"status": "INSTRUCTION_ADDED", "instruction": payload.instruction}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send instruction signal to workflow '{run_id}': {e}",
        )


@router.post("/{run_id}/interrupt", status_code=status.HTTP_200_OK)
async def interrupt_run_signal(run_id: str):
    """Pause / interrupt execution of a running workflow."""
    try:
        await temporal_client_manager.send_interrupt_signal(run_id)
        return {"status": "INTERRUPT_SIGNAL_SENT"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send interrupt signal to workflow '{run_id}': {e}",
        )


@router.post("/{run_id}/resume", status_code=status.HTTP_200_OK)
async def resume_run_signal(run_id: str):
    """Resume execution of a paused workflow."""
    try:
        await temporal_client_manager.send_resume_signal(run_id)
        return {"status": "RESUME_SIGNAL_SENT"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send resume signal to workflow '{run_id}': {e}",
        )


@router.post("/{run_id}/terminate", status_code=status.HTTP_200_OK)
async def terminate_run_signal(run_id: str):
    """Terminate workflow run execution."""
    try:
        await temporal_client_manager.send_terminate_signal(run_id)
        return {"status": "TERMINATE_SIGNAL_SENT"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send terminate signal to workflow '{run_id}': {e}",
        )
