"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchSupervisors, startRun, Supervisor } from "@/lib/api";

export default function NewRunPage() {
  const router = useRouter();
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [orderId, setOrderId] = useState(`ORD-${Math.floor(1000 + Math.random() * 9000)}`);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState("");
  const [initialInstruction, setInitialInstruction] = useState("Prioritize fast resolution and escalate any delay over 12 hours.");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchSupervisors()
      .then((data) => {
        setSupervisors(data);
        if (data.length > 0) setSelectedSupervisorId(data[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupervisorId) return alert("Please select a supervisor template.");
    setSubmitting(true);
    try {
      const run = await startRun({
        order_id: orderId,
        supervisor_id: selectedSupervisorId,
        initial_instructions: initialInstruction,
      });
      router.push(`/runs/${run.id}`);
    } catch (err: any) {
      alert("Failed to launch order run: " + err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="border-b border-zinc-800/80 pb-5">
        <h1 className="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">
          Launch New Order Run
        </h1>
        <p className="mt-1 text-xs text-zinc-400">
          Start a durable Temporal workflow supervisor instance linked to an order.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6 shadow-sm">
        {loading ? (
          <div className="py-8 text-center text-xs text-zinc-500">Loading supervisors...</div>
        ) : supervisors.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs text-zinc-400">No supervisor templates found. Create one first!</p>
            <button
              onClick={() => router.push("/supervisors")}
              className="mt-3 text-xs font-semibold text-zinc-200 hover:underline"
            >
              Go to Supervisor Configurations &rarr;
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase text-zinc-300">Order ID</label>
                <span className="font-mono text-[10px] text-zinc-500">External Store Identifier</span>
              </div>
              <input
                type="text"
                required
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3.5 py-2 font-mono text-xs text-zinc-100 focus:border-zinc-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-zinc-300">Select Supervisor Template</label>
              <select
                value={selectedSupervisorId}
                onChange={(e) => setSelectedSupervisorId(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-xs text-zinc-100 focus:border-zinc-400 focus:outline-none"
              >
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.id})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-zinc-300">Initial Run Instruction (Optional)</label>
              <textarea
                rows={3}
                placeholder="Specific guidance for this particular order run..."
                value={initialInstruction}
                onChange={(e) => setInitialInstruction(e.target.value)}
                className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-xs text-zinc-100 focus:border-zinc-400 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-zinc-800/80 pt-4">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="rounded-md border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-zinc-100 px-5 py-2 text-xs font-semibold text-zinc-900 shadow-sm transition-all hover:bg-white active:scale-95"
              >
                {submitting ? "Launching Workflow..." : "Launch Order Workflow"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
