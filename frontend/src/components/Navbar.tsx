"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function Navbar() {
  const pathname = usePathname();
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("http://localhost:8000/health")
      .then((res) => setBackendHealthy(res.ok))
      .catch(() => setBackendHealthy(false));
  }, []);

  const navLinks = [
    { href: "/", label: "Dashboard" },
    { href: "/supervisors", label: "Supervisors" },
    { href: "/runs/new", label: "Launch Order Run" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
        {/* Brand Logo & Title */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 font-mono text-xs font-bold text-zinc-100 shadow-sm transition-colors group-hover:border-zinc-500">
            SP
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-zinc-100">
              SagePilot
            </span>
            <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] font-medium text-zinc-400">
              order-supervisor
            </span>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "bg-zinc-800 text-zinc-100 shadow-sm"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Live Backend Status */}
        <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/80 px-2.5 py-1 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              backendHealthy === true
                ? "bg-emerald-500"
                : backendHealthy === false
                ? "bg-rose-500"
                : "bg-amber-500"
            }`}
          />
          <span className="font-mono text-[11px] text-zinc-400">
            {backendHealthy === true
              ? "API Online"
              : backendHealthy === false
              ? "API Offline"
              : "Connecting..."}
          </span>
        </div>
      </div>
    </header>
  );
}
