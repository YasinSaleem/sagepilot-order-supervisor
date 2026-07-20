# SagePilot Order Supervisor

> **Autonomous, State-Driven E-Commerce Order Lifecycle Supervisor**  
> Powered by **Temporal Workflows**, **OpenRouter / OpenAI LLM Tool Calling**, **Supabase PostgreSQL**, **FastAPI**, and **Next.js**.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![Python 3.12](https://img.shields.io/badge/Python-3.12+-3776AB.svg?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi&logoColor=white)
![Temporal](https://img.shields.io/badge/Temporal.io-SDK-24292E.svg?logo=temporal&logoColor=white)
![Next.js 14](https://img.shields.io/badge/Next.js-14.2-000000.svg?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6.svg?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4.svg?logo=tailwindcss&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-4169E1.svg?logo=postgresql&logoColor=white)

---

## Executive Overview

**SagePilot Order Supervisor** is an enterprise-grade, event-driven agentic framework that monitors single e-commerce order lifecycles from placement to terminal delivery or resolution. 

Unlike traditional cron-based scripts or stateless LLM agents, SagePilot orchestrates long-running agent state machine loops using **Temporal workflows**, maintaining durable sleep/wake timers, handling real-time order signal updates, executing operational side-effect tools, and archiving history to a permanent **Supabase PostgreSQL** data lake.

---

## System Architecture

```mermaid
flowchart LR
    Client["Next.js Frontend\n(Dashboard & Live Inspection)"]
    API["FastAPI Backend\n(REST Routes & Control Signals)"]
    Temporal["Temporal Engine\n(Durable Sleep/Wake & State Machine)"]
    LLM["OpenRouter / OpenAI\n(Agent Reasoning & Tool Calling)"]
    DB[("Supabase PostgreSQL\n(Permanent Data Lake)")]

    Client -->|HTTP REST / Short-Polling| API
    API -->|Start & Signal Workflows| Temporal
    API -->|Fast Dashboard List Queries| DB
    Temporal <-->|Live get_state Query| API
    Temporal -->|Worker Activities| LLM
    Temporal -->|Sync Status & Archive History| DB
```

### Key Architectural Design Patterns

1. **Dual-Read / Single-Write Architecture**:
   - **Postgres (Supabase)** acts as the permanent data lake for historical runs (`supervisors`, `order_runs`, `timeline_events`, `action_logs`). Fast list views hit Postgres directly.
   - **Temporal Workflows** hold live runtime state (`memory_summary`, `run_instructions`, live status, `next_wakeup_at`). `GET /api/runs/{run_id}` queries live state directly from Temporal via `get_state()` to eliminate dual-write drift.
2. **Tool Calling & Control Action Separation**:
   - **Side-Effect Tools** (`send_customer_message`, `create_internal_note`, `escalate_issue`, `mark_order_for_review`) execute inside activities and record action logs in Postgres.
   - **Control Tools** (`schedule_next_wakeup`, `close_workflow`) return a structured `control_action` payload for the Temporal workflow loop to interpret, as activities cannot directly manipulate workflow execution state.
3. **Allow-List Event Classifier Bypass**:
   - Critical events in `wake_policy.auto_wake_event_types` bypass LLM API calls and trigger immediate workflow wake-ups. Non-allow-listed events call the lightweight OpenRouter classifier activity.
4. **Bounded Timeline Sliding Window**:
   - Memory state keeps the last 10 events in workflow context. Evicted older events are automatically archived into Supabase PostgreSQL `timeline_events` via activities to prevent state payload bloat.
5. **Signal-Draining Safety & continue_as_new()**:
   - Ensures long-running workflows automatically execute `continue_as_new()` when history size reaches threshold, with signal-draining safety guarantees to prevent event loss.

---

## Repository Structure

```text
sagepilot-order-supervisor/
├── backend/
│   ├── app/
│   │   ├── agent/                 # Agent Runtime & OpenRouter LLM Engine
│   │   │   ├── classifier.py      # Event Classifier (Allow-List & LLM)
│   │   │   ├── prompts.py         # System Prompts & Learning Templates
│   │   │   ├── runtime.py         # OpenRouter Tool Calling Inference Cycle
│   │   │   └── tools.py           # 6 Tool Schemas & Side-Effect Handlers
│   │   ├── api/                   # FastAPI API Routes
│   │   │   ├── runs.py            # Workflow Run Launcher, Query & Controls
│   │   │   └── supervisors.py     # Supervisor Configuration Endpoints
│   │   ├── models/                # SQLAlchemy Models & Pydantic Schemas
│   │   │   ├── domain.py          # Supervisor, OrderRun, TimelineEvent, ActionLog
│   │   │   └── schemas.py         # Request/Response Pydantic DTOs
│   │   ├── temporal/              # Temporal Orchestration Layer
│   │   │   ├── activities.py      # DB Sync, Classification, Agent & Learnings Activities
│   │   │   ├── client.py          # Temporal Client Manager Connection Helper
│   │   │   ├── worker.py          # Worker Process Entry Point
│   │   │   └── workflows.py       # OrderSupervisorWorkflow State Machine
│   │   ├── config.py              # Application Configuration & Settings
│   │   ├── database.py            # Async SQLAlchemy Engine & Supabase Pooler
│   │   └── main.py                # FastAPI Application Entry Point
│   ├── tests/                     # Comprehensive Pytest Suite (17 Tests)
│   │   ├── test_agent_runtime.py  # Agent Tools & Classifier Unit Tests
│   │   ├── test_api_routes.py     # FastAPI Route Async Integration Tests
│   │   ├── test_db_persistence.py # DB Persistence & Activity Sync Tests
│   │   ├── test_workflow.py       # Workflow Environment Unit Tests
│   │   └── test_workflow_lifecycle.py # Workflow State Machine Lifecycle Tests
│   ├── pytest.ini                 # Pytest Asyncio Configuration
│   └── requirements.txt           # Python Dependencies
├── frontend/                      # Next.js App Router Frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx           # Dashboard / Order Runs Overview Table
│   │   │   ├── supervisors/       # Supervisor Management Page
│   │   │   └── runs/
│   │   │       ├── new/           # Order Run Launcher Page
│   │   │       └── [id]/          # Real-Time Short-Polling Run Inspection View
│   │   ├── components/
│   │   │   └── Navbar.tsx         # Navigation Bar & API Status Indicator
│   │   └── lib/
│   │       └── api.ts             # Type-Safe REST API Client Helper
│   ├── tailwind.config.ts         # Dark-Mode Glassmorphism Design Token Rules
│   └── package.json
└── task.md                        # Master Progress Tracking File
```

---

## Quickstart & Setup Guide

### Prerequisites
- **Python**: `3.11` or `3.12`
- **Node.js**: `18.x` or `20.x`
- **Temporal Server**: Local CLI (`temporal server start-dev`) or Temporal Cloud / Docker instance.
- **OpenRouter API Key**: Obtain from OpenRouter.

---

### 1. Backend Setup

```bash
# Clone the repository
git clone https://github.com/YasinSaleem/sagepilot-order-supervisor.git
cd sagepilot-order-supervisor/backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

Create a `.env` file inside `backend/`:

```env
PROJECT_NAME="SagePilot Order Supervisor"
VERSION="1.0.0"

# Database Connection (PostgreSQL)
DATABASE_URL="postgresql+asyncpg://user:password@localhost:5432/dbname"

# Temporal Configuration
TEMPORAL_HOST="localhost:7233"
TEMPORAL_NAMESPACE="default"
TEMPORAL_TASK_QUEUE="order-supervisor-task-queue"

# OpenRouter Configuration
OPENROUTER_API_KEY="sk-or-v1-your-api-key-here"
OPENROUTER_MODEL="openai/gpt-4o-mini"
OPENROUTER_BASE_URL="https://openrouter.ai/api/v1"
```

---

### 2. Start Services

#### Step A: Start Temporal Dev Server (Terminal 1)
```bash
temporal server start-dev
```

#### Step B: Start FastAPI Backend Server (Terminal 2)
```bash
cd backend
source .venv/bin/activate
PYTHONPATH=. uvicorn app.main:app --reload --port 8000
```

#### Step C: Start Temporal Worker (Terminal 3)
```bash
cd backend
source .venv/bin/activate
PYTHONPATH=. python app/temporal/worker.py
```

#### Step D: Start Next.js Frontend (Terminal 4)
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` in your browser to view the **SagePilot Order Supervisor Dashboard**.

---

## Testing & Verification

The repository contains a multi-module **Pytest** test suite that runs against live Supabase PostgreSQL and in-memory Temporal workflow environments (`temporalio.testing.WorkflowEnvironment`).

To run the complete test suite:

```bash
cd backend
source .venv/bin/activate
PYTHONPATH=. pytest -v tests/
```

### Verified Test Matrix (17/17 Passing)
- `test_agent_tools_schema`: Tool definitions schema validation.
- `test_classifier_allowlist_bypass`: Auto-wake allow-list matching.
- `test_side_effect_tool_execution`: Operational tool simulation.
- `test_run_agent_cycle_activity_and_action_logging`: Tool call execution & DB action logging.
- `test_end_of_run_learnings_generator`: Final learnings and recommendation report generation.
- `test_create_and_list_supervisors_api`: `POST /api/supervisors`, `GET /api/supervisors`.
- `test_start_and_get_runs_api`: `POST /api/runs`, `GET /api/runs/{id}` live state queries.
- `test_run_signal_controls_api`: Workflow control endpoints (events, instructions, interrupt, resume, terminate).
- `test_database_table_creation`: Table existence SQL validation.
- `test_supervisor_orm_crud`: Supervisor template ORM CRUD.
- `test_order_run_status_activity_sync`: `update_run_status` activity DB sync.
- `test_timeline_archival_activity`: `archive_timeline_events` activity DB insertion.
- `test_action_log_activity`: `record_action_log` activity DB logging.
- `test_order_supervisor_workflow`: Workflow initialization & query handler test.
- `test_workflow_full_lifecycle_and_db_sync`: Full end-to-end workflow execution & terminal persistence.
- `test_workflow_pause_and_resume_state_machine`: Interrupt & Resume state machine transitions.
- `test_workflow_timeline_bounded_eviction_to_postgres`: Sliding window timeline eviction (15 signals -> <=10 memory, evicted to Postgres).

---

## API Endpoints Reference

Interactive OpenAPI documentation is available at `http://localhost:8000/docs`.

### Supervisors
- `POST /api/supervisors`: Create a new supervisor configuration template.
- `GET /api/supervisors`: List all supervisor templates.
- `GET /api/supervisors/{id}`: Fetch supervisor template details by ID.

### Order Workflow Runs
- `POST /api/runs`: Launch a long-running Temporal order supervisor workflow.
- `GET /api/runs`: List active and completed runs (from Supabase Postgres for fast, paginated dashboard list views).
- `GET /api/runs/{run_id}`: Read base record from Postgres, query live runtime state directly from Temporal via `get_state()`, and fall back to persisted DB data if completed.
- `POST /api/runs/{run_id}/events`: Inject an event signal into a running workflow (`payment_failed`, `shipment_delayed`, `delivered`, etc.).
- `POST /api/runs/{run_id}/instructions`: Append a dynamic run instruction signal.
- `POST /api/runs/{run_id}/interrupt`: Pause / interrupt workflow execution.
- `POST /api/runs/{run_id}/resume`: Resume execution of a paused workflow.
- `POST /api/runs/{run_id}/terminate`: Terminate workflow execution.

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
