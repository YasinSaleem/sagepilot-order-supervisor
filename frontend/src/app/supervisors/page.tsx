"use client";

import { useEffect, useState } from "react";
import { fetchSupervisors, createSupervisor, Supervisor } from "@/lib/api";

export default function SupervisorsPage() {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [baseInstruction, setBaseInstruction] = useState("");
  const [autoWakeTypes, setAutoWakeTypes] = useState("payment_failed, shipment_delayed, refund_requested");
  const [submitting, setSubmitting] = useState(false);

  const loadSupervisors = async () => {
    try {
      const data = await fetchSupervisors();
      setSupervisors(data);
    } catch (err) {
      console.error("Error loading supervisors:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSupervisors();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const wakeTypesList = autoWakeTypes.split(",").map((s) => s.trim()).filter(Boolean);
      await createSupervisor({
        name,
        base_instruction: baseInstruction,
        wake_policy: {
          aggressiveness: "medium",
          auto_wake_event_types: wakeTypesList,
        },
      });
      setName("");
      setBaseInstruction("");
      setShowModal(false);
      await loadSupervisors();
    } catch (err) {
      alert("Failed to create supervisor");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">
            Supervisor Configurations
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            Define system prompts, available tool permissions, and event wake policies.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center justify-center rounded-md bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-900 shadow-sm transition-all hover:bg-white active:scale-95"
        >
          + Create Supervisor Template
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-zinc-500">Loading supervisor templates...</div>
      ) : supervisors.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-12 text-center">
          <p className="text-xs text-zinc-400">No supervisor configurations exist yet.</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-3 text-xs font-semibold text-zinc-200 hover:text-white"
          >
            Create your first supervisor &rarr;
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {supervisors.map((sup) => (
            <div
              key={sup.id}
              className="flex flex-col justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-5 transition-all hover:border-zinc-700"
            >
              <div>
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <h3 className="text-sm font-bold text-zinc-100">{sup.name}</h3>
                  <span className="font-mono text-[10px] text-zinc-400 bg-zinc-950 border border-zinc-800 px-2 py-0.5 rounded">
                    {sup.id}
                  </span>
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-500">
                      Base Instruction:
                    </span>
                    <p className="mt-1 text-xs text-zinc-300 line-clamp-3 bg-zinc-950/60 p-3 rounded border border-zinc-800/80">
                      {sup.base_instruction}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-500">
                      Auto-Wake Allow-List:
                    </span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {sup.wake_policy?.auto_wake_event_types?.map((type) => (
                        <span
                          key={type}
                          className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-emerald-400"
                        >
                          ⚡ {type}
                        </span>
                      )) || <span className="text-xs text-zinc-500">None</span>}
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-5 border-t border-zinc-800/60 pt-3 font-mono text-[10px] text-zinc-500">
                Created: {new Date(sup.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal for Creating Supervisor */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
            <h2 className="text-base font-bold text-zinc-100">Create Supervisor Configuration</h2>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-300">Supervisor Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VIP Delivery Monitor Guard"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-xs text-zinc-100 focus:border-zinc-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-300">Base Instruction</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Instructions for the agent on how to manage orders, escalate delays, and contact customers..."
                  value={baseInstruction}
                  onChange={(e) => setBaseInstruction(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-xs text-zinc-100 focus:border-zinc-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase text-zinc-300">Auto-Wake Allow-List (Comma-separated)</label>
                <input
                  type="text"
                  value={autoWakeTypes}
                  onChange={(e) => setAutoWakeTypes(e.target.value)}
                  className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-xs text-zinc-100 focus:border-zinc-400 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-md border border-zinc-700 bg-zinc-800 px-4 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-md bg-zinc-100 px-4 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-white"
                >
                  {submitting ? "Saving..." : "Create Configuration"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
