from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


# Supervisor Schemas
class WakePolicySchema(BaseModel):
    aggressiveness: str = Field(default="medium", description="low, medium, high")
    auto_wake_event_types: List[str] = Field(
        default_factory=lambda: [
            "payment_failed",
            "refund_requested",
            "customer_message_received",
        ]
    )


class ModelConfigSchema(BaseModel):
    model: str = "gpt-4o-mini"
    temperature: float = 0.2


class SupervisorCreate(BaseModel):
    name: str
    base_instruction: str
    available_tools: List[str] = Field(
        default_factory=lambda: [
            "send_customer_message",
            "create_internal_note",
            "escalate_issue",
            "mark_order_for_review",
            "schedule_next_wakeup",
            "close_workflow",
        ]
    )
    wake_policy: WakePolicySchema = Field(default_factory=WakePolicySchema)
    model_config_data: ModelConfigSchema = Field(default_factory=ModelConfigSchema)


class SupervisorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    base_instruction: str
    available_tools: List[str]
    wake_policy: WakePolicySchema
    model_config_data: ModelConfigSchema
    created_at: datetime


# Run Schemas
class RunCreate(BaseModel):
    order_id: str
    supervisor_id: str
    initial_instructions: Optional[str] = None


class RunEventInject(BaseModel):
    event_type: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    source: str = "USER"


class RunInstructionAdd(BaseModel):
    instruction: str


class RunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    order_id: str
    supervisor_id: str
    status: str
    next_wakeup_at: Optional[datetime] = None
    final_output: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    # Live Temporal state & DB attributes (populated when available)
    memory_summary: Optional[str] = None
    run_instructions: Optional[List[str]] = None
    timeline_events: Optional[List[Dict[str, Any]]] = None
    action_logs: Optional[List[Dict[str, Any]]] = None
