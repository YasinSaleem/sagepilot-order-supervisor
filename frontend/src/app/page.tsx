"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchRuns, OrderRun } from "@/lib/api";

export default function DashboardPage() {
  const [runs, setRuns] = useState<OrderRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRuns = async () => {
    try {
      const data = await fetchRuns();
      setRuns(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load order runs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRuns();
    // Short-polling every 3 seconds for fast dashboard updates
    const interval = setInterval(loadRuns, 3000);
    return () => clearInterval(interval);
  }, []);

  const totalRuns = runs.length;
  const activeRuns = runs.filter((r) => r.status === "RUNNING" || r.status === "WAKING").length;
  const sleepingRuns = runs.filter((r) => r.status === "SLEEPING").length;
  const completedRuns = runs.filter((r) => r.status === "COMPLETED").length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "RUNNING":
        return (
          <span className="inline-flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            RUNNING
          </span>
        );
      case "WAKING":
        return (
          <span className="inline-flex items-center gap-1.5 rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-indigo-300">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping" />
            WAKING
          </span>
        );
      case "SLEEPING":
        return (
          <span className="inline-flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            SLEEPING
          </span>
        );
      case "PAUSED":
        return (
          <span className="inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-300">
            PAUSED
          </span>
        );
      case "COMPLETED":
        return (
          <span className="inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-400">
            COMPLETED
          </span>
        );
      case "TERMINATED":
        return (
          <span className="inline-flex items-center gap-1.5 rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-rose-400">
            TERMINATED
          </span>
        );
      default:
        return <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-400">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800/80 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">
            Order Supervisor Runs
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            Durable Temporal workflows monitoring e-commerce order lifecycles.
          </p>
        </div>
        <Link
          href="/runs/new"
          className="inline-flex items-center justify-center rounded-md bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-900 shadow-sm transition-all hover:bg-white active:scale-95"
        >
          + Launch Order Run
        </Link>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Total Runs</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-zinc-100">{totalRuns}</div>
        </div>
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-400/80">Active / Waking</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-emerald-400">{activeRuns}</div>
        </div>
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-amber-400/80">Sleeping Workflows</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-amber-300">{sleepingRuns}</div>
        </div>
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-4">
          <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">Completed Orders</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-zinc-300">{completedRuns}</div>
        </div>
      </div>

      {/* Main Order Runs Table */}
      <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 shadow-sm">
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-3.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
            Active & Recent Workflow Runs
          </h2>
          <span className="font-mono text-[10px] text-zinc-500">Auto-refresh: 3s</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-zinc-500">Loading order runs...</div>
        ) : error ? (
          <div className="py-12 text-center text-xs text-rose-400">{error}</div>
        ) : runs.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-xs text-zinc-500">No order supervisor runs launched yet.</p>
            <Link
              href="/runs/new"
              className="mt-2 inline-block text-xs font-semibold text-zinc-300 hover:text-white"
            >
              Launch your first order run &rarr;
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead className="border-b border-zinc-800 bg-zinc-950/60 text-[11px] uppercase tracking-wider text-zinc-500 font-mono">
                <tr>
                  <th className="px-5 py-3 font-medium">Run ID</th>
                  <th className="px-5 py-3 font-medium">Order ID</th>
                  <th className="px-5 py-3 font-medium">Supervisor Template</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Next Wake-up</th>
                  <th className="px-5 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40 font-mono">
                {runs.map((run) => (
                  <tr key={run.id} className="transition-colors hover:bg-zinc-800/30">
                    <td className="px-5 py-3.5 text-zinc-200 font-bold">{run.id}</td>
                    <td className="px-5 py-3.5 text-zinc-100 font-semibold">{run.order_id}</td>
                    <td className="px-5 py-3.5 text-zinc-400">{run.supervisor_id}</td>
                    <td className="px-5 py-3.5 font-sans">{getStatusBadge(run.status)}</td>
                    <td className="px-5 py-3.5 text-zinc-400 text-[11px]">
                      {run.next_wakeup_at ? new Date(run.next_wakeup_at).toLocaleTimeString() : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-right font-sans">
                      <Link
                        href={`/runs/${run.id}`}
                        className="inline-flex items-center rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700 hover:text-white"
                      >
                        Inspect &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
