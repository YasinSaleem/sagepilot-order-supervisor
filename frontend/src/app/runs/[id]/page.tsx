"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  fetchRunDetails,
  injectRunEvent,
  addRunInstruction,
  interruptRun,
  resumeRun,
  terminateRun,
  OrderRun,
} from "@/lib/api";

export default function RunInspectionPage() {
  const params = useParams();
  const router = useRouter();
  const runId = params.id as string;

  const [run, setRun] = useState<OrderRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Signal State
  const [newInstruction, setNewInstruction] = useState("");
  const [customEventType, setCustomEventType] = useState("custom_event");
  const [customEventPayload, setCustomEventPayload] = useState('{\n  "note": "custom payload"\n}');
  const [actionLoading, setActionLoading] = useState(false);

  const loadDetails = async () => {
    try {
      const data = await fetchRunDetails(runId);
      setRun(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Error fetching run details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
    // Live Short-Polling every 2 seconds while active
    const interval = setInterval(() => {
      loadDetails();
    }, 2000);
    return () => clearInterval(interval);
  }, [runId]);

  const handleInjectPreset = async (eventType: string, payload: Record<string, any>) => {
    setActionLoading(true);
    try {
      await injectRunEvent(runId, eventType, payload);
      await loadDetails();
    } catch (err: any) {
      alert("Failed to inject event: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleInjectCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const parsedPayload = JSON.parse(customEventPayload);
      await injectRunEvent(runId, customEventType, parsedPayload);
      await loadDetails();
    } catch (err: any) {
      alert("Invalid JSON payload or error: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddInstruction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstruction.trim()) return;
    setActionLoading(true);
    try {
      await addRunInstruction(runId, newInstruction.trim());
      setNewInstruction("");
      await loadDetails();
    } catch (err: any) {
      alert("Failed to send instruction: " + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleControlAction = async (action: "interrupt" | "resume" | "terminate") => {
    setActionLoading(true);
    try {
      if (action === "interrupt") await interruptRun(runId);
      else if (action === "resume") await resumeRun(runId);
      else if (action === "terminate") await terminateRun(runId);
      await loadDetails();
    } catch (err: any) {
      alert(`Failed to execute ${action}: ` + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading)
    return (
      <div className="flex h-96 items-center justify-center text-xs text-zinc-500">
        <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-3 shadow-sm">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          <span className="font-mono">Syncing Temporal state...</span>
        </div>
      </div>
    );

  if (error || !run)
    return (
      <div className="flex h-96 items-center justify-center text-xs text-rose-400">
        <div className="rounded-lg border border-rose-900/40 bg-rose-950/20 p-6 text-center">
          <p className="font-mono font-medium">{error || "Order run not found"}</p>
          <Link
            href="/"
            className="mt-3 inline-block font-sans text-xs text-zinc-300 hover:text-white"
          >
            ← Return to Dashboard
          </Link>
        </div>
      </div>
    );

  const isTerminal = run.status === "COMPLETED" || run.status === "TERMINATED";
  const isPaused = run.status === "PAUSED";

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "RUNNING":
        return (
          <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            RUNNING
          </span>
        );
      case "WAKING":
        return (
          <span className="inline-flex items-center gap-1.5 rounded border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-indigo-300">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-indigo-400" />
            WAKING & REASONING
          </span>
        );
      case "SLEEPING":
        return (
          <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            SLEEPING (TIMER ACTIVE)
          </span>
        );
      case "PAUSED":
        return (
          <span className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 font-mono text-[11px] font-medium text-zinc-300">
            PAUSED
          </span>
        );
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 font-mono text-[11px] font-medium text-zinc-400">
            COMPLETED
          </span>
        );
      case "TERMINATED":
        return (
          <span className="inline-flex items-center gap-1.5 rounded border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-rose-400">
            TERMINATED
          </span>
        );
      default:
        return (
          <span className="rounded border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 font-mono text-[11px] text-zinc-400">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-400 hover:text-zinc-200"
              >
                ← Back
              </Link>
              <h1 className="text-xl font-bold font-mono text-zinc-100">{run.order_id}</h1>
              {getStatusBadge(run.status)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[11px] text-zinc-400">
              <span>
                Run ID: <span className="text-zinc-200 font-medium">{run.id}</span>
              </span>
              <span>•</span>
              <span>
                Supervisor: <span className="text-zinc-300 font-medium">{run.supervisor_id}</span>
              </span>
              <span>•</span>
              <span>Launched: {new Date(run.created_at).toLocaleTimeString()}</span>
            </div>
          </div>

          {/* Controls */}
          {!isTerminal && (
            <div className="flex items-center gap-2">
              {isPaused ? (
                <button
                  onClick={() => handleControlAction("resume")}
                  disabled={actionLoading}
                  className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-mono text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 active:scale-95"
                >
                  ▶ Resume Run
                </button>
              ) : (
                <button
                  onClick={() => handleControlAction("interrupt")}
                  disabled={actionLoading}
                  className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-mono text-xs font-semibold text-amber-300 hover:bg-amber-500/20 active:scale-95"
                >
                  ⏸ Pause Run
                </button>
              )}
              <button
                onClick={() => handleControlAction("terminate")}
                disabled={actionLoading}
                className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 font-mono text-xs font-semibold text-rose-400 hover:bg-rose-500/20 active:scale-95"
              >
                ⏹ Terminate
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Terminal Output Banner */}
      {isTerminal && run.final_output && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 font-mono">
            <h2 className="text-xs font-bold text-zinc-200">🏁 Final Workflow Summary & Learnings</h2>
            <span className="text-[10px] text-zinc-500">Completed: {run.final_output.completed_at}</span>
          </div>

          <div className="mt-3 space-y-3 text-xs text-zinc-300">
            <div>
              <span className="font-mono text-[10px] uppercase font-semibold text-zinc-400">Summary:</span>
              <p className="mt-1 rounded border border-zinc-800 bg-zinc-950 p-3 text-zinc-200">
                {run.final_output.learnings_report?.final_summary || run.final_output.memory_summary}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <span className="font-mono text-[10px] uppercase font-semibold text-emerald-400">Key Learnings:</span>
                <ul className="mt-1 list-inside list-disc space-y-1 rounded border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-300">
                  {run.final_output.learnings_report?.learnings?.map((l: string, idx: number) => (
                    <li key={idx}>{l}</li>
                  )) || <li>Workflow completed under supervisor rules.</li>}
                </ul>
              </div>

              <div>
                <span className="font-mono text-[10px] uppercase font-semibold text-amber-400">Recommendations:</span>
                <ul className="mt-1 list-inside list-disc space-y-1 rounded border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-300">
                  {run.final_output.learnings_report?.recommendations?.map((r: string, idx: number) => (
                    <li key={idx}>{r}</li>
                  )) || <li>No follow-up recommendations.</li>}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Memory Summary & Live Instructions Header Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Memory Summary */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
              🧠 Compact Memory Summary
            </h3>
            <span className="font-mono text-[10px] text-zinc-500">Live State Context</span>
          </div>
          <p className="mt-2.5 rounded border border-zinc-800 bg-zinc-950 p-3 font-sans text-xs leading-relaxed text-zinc-200">
            {run.memory_summary || "Order workflow initialized. Awaiting event processing."}
          </p>
        </div>

        {/* Live Run Instructions */}
        <div className="flex flex-col justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
                📋 Live Run Instructions
              </h3>
              <span className="font-mono text-[10px] text-zinc-500">Dynamic Overrides</span>
            </div>
            <div className="mt-2.5 space-y-1.5">
              {run.run_instructions && run.run_instructions.length > 0 ? (
                run.run_instructions.map((inst, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 rounded border border-zinc-800 bg-zinc-950 p-2 text-xs text-zinc-300"
                  >
                    <span className="font-mono text-zinc-500">•</span>
                    <span>{inst}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-zinc-500">No custom instructions added.</p>
              )}
            </div>
          </div>

          {!isTerminal && (
            <form onSubmit={handleAddInstruction} className="mt-3 border-t border-zinc-800 pt-2.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add custom instruction to context..."
                  value={newInstruction}
                  onChange={(e) => setNewInstruction(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 focus:border-zinc-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-white active:scale-95"
                >
                  Add
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Signal Injector Bar */}
      {!isTerminal && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
              ⚡ Inject Order Event Signal
            </h3>
            <span className="font-mono text-[10px] text-zinc-500">Real-Time Event Trigger</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            <button
              onClick={() =>
                handleInjectPreset("payment_failed", { amount: 129.99, reason: "Card Declined" })
              }
              disabled={actionLoading}
              className="rounded border border-rose-500/30 bg-rose-500/10 p-2.5 text-left transition-colors hover:bg-rose-500/20 active:scale-95"
            >
              <div className="font-mono text-xs font-bold text-rose-300">⚡ payment_failed</div>
              <div className="mt-0.5 text-[10px] text-rose-400/80">Card decline</div>
            </button>

            <button
              onClick={() =>
                handleInjectPreset("shipment_delayed", { carrier: "FedEx", delay_hours: 24 })
              }
              disabled={actionLoading}
              className="rounded border border-amber-500/30 bg-amber-500/10 p-2.5 text-left transition-colors hover:bg-amber-500/20 active:scale-95"
            >
              <div className="font-mono text-xs font-bold text-amber-300">⚡ shipment_delayed</div>
              <div className="mt-0.5 text-[10px] text-amber-400/80">Carrier delay</div>
            </button>

            <button
              onClick={() =>
                handleInjectPreset("customer_message_received", { message: "Where is my order?" })
              }
              disabled={actionLoading}
              className="rounded border border-indigo-500/30 bg-indigo-500/10 p-2.5 text-left transition-colors hover:bg-indigo-500/20 active:scale-95"
            >
              <div className="font-mono text-xs font-bold text-indigo-300">⚡ customer_message</div>
              <div className="mt-0.5 text-[10px] text-indigo-400/80">Inquiry message</div>
            </button>

            <button
              onClick={() =>
                handleInjectPreset("delivered", { status: "Delivered to Front Door" })
              }
              disabled={actionLoading}
              className="rounded border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-left transition-colors hover:bg-emerald-500/20 active:scale-95"
            >
              <div className="font-mono text-xs font-bold text-emerald-300">⚡ delivered</div>
              <div className="mt-0.5 text-[10px] text-emerald-400/80">Delivery success</div>
            </button>

            <button
              onClick={() =>
                handleInjectPreset("refund_requested", { reason: "Damaged packaging" })
              }
              disabled={actionLoading}
              className="rounded border border-zinc-700 bg-zinc-800 p-2.5 text-left transition-colors hover:bg-zinc-700 active:scale-95"
            >
              <div className="font-mono text-xs font-bold text-zinc-200">⚡ refund_requested</div>
              <div className="mt-0.5 text-[10px] text-zinc-400">Return inquiry</div>
            </button>
          </div>

          <form onSubmit={handleInjectCustom} className="mt-3 border-t border-zinc-800 pt-3 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Custom Event Name"
                value={customEventType}
                onChange={(e) => setCustomEventType(e.target.value)}
                className="w-1/3 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-100 focus:border-zinc-400 focus:outline-none"
              />
              <textarea
                rows={1}
                value={customEventPayload}
                onChange={(e) => setCustomEventPayload(e.target.value)}
                className="w-2/3 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-zinc-100 focus:border-zinc-400 focus:outline-none"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={actionLoading}
                className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 active:scale-95"
              >
                Inject Custom Signal
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Side-by-Side Activity Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Box: Executed Agent Tool Actions */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
              🛠️ Executed Agent Tool Actions ({run.action_logs?.length || 0})
            </h3>
            <span className="font-mono text-[10px] text-zinc-500">Activity Log</span>
          </div>

          <div className="mt-3 max-h-[600px] overflow-y-auto space-y-2.5 pr-1">
            {run.action_logs && run.action_logs.length > 0 ? (
              run.action_logs.map((action, idx) => (
                <div
                  key={action.id || idx}
                  className="rounded border border-zinc-800 bg-zinc-950 p-3.5 transition-colors hover:border-zinc-700 font-mono"
                >
                  <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-400">
                        ⚡ {action.tool_name}
                      </span>
                      <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">
                        TOOL CALL
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500">
                      {action.timestamp ? new Date(action.timestamp).toLocaleTimeString() : ""}
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-2">
                    <div>
                      <span className="text-[10px] uppercase text-zinc-500">Inputs / Arguments:</span>
                      <pre className="mt-1 overflow-x-auto rounded border border-zinc-800 bg-zinc-900/90 p-2 text-[11px] text-zinc-200">
                        {JSON.stringify(action.tool_input, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-zinc-500">Execution Output:</span>
                      <pre className="mt-1 overflow-x-auto rounded border border-zinc-800 bg-zinc-900/90 p-2 text-[11px] text-emerald-300">
                        {JSON.stringify(action.tool_output, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-xs text-zinc-500">
                No tool actions executed yet by agent. Inject an event signal to trigger LLM actions.
              </div>
            )}
          </div>
        </div>

        {/* Right Box: Order Timeline Events */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
              📜 Order Timeline Events ({run.timeline_events?.length || 0})
            </h3>
            <span className="font-mono text-[10px] text-zinc-500">Event Stream Log</span>
          </div>

          <div className="mt-3 max-h-[600px] overflow-y-auto space-y-2.5 pr-1 font-mono">
            {run.timeline_events && run.timeline_events.length > 0 ? (
              run.timeline_events.map((ev, idx) => (
                <div
                  key={idx}
                  className="rounded border border-zinc-800 bg-zinc-950 p-3.5 transition-colors hover:border-zinc-700"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-200">{ev.event_type}</span>
                      <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] uppercase text-zinc-400">
                        {ev.source || "SIGNAL"}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-500">
                      {ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : ""}
                    </span>
                  </div>
                  {ev.payload && Object.keys(ev.payload).length > 0 && (
                    <pre className="mt-2 overflow-x-auto rounded border border-zinc-800 bg-zinc-900/90 p-2 text-[11px] text-zinc-300">
                      {JSON.stringify(ev.payload, null, 2)}
                    </pre>
                  )}
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-xs text-zinc-500">
                No timeline events recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
