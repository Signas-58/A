"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type NavItem = {
  key: "dashboard" | "requests" | "users" | "audit" | "evidence";
  label: string;
};

type SubTab = {
  key: "pending" | "activity" | "health";
  label: string;
};

export default function AdminDashboardPage() {
  const router = useRouter();

  const navItems = useMemo<NavItem[]>(
    () => [
      { key: "dashboard", label: "Dashboard" },
      { key: "requests", label: "Access Requests" },
      { key: "users", label: "User Management" },
      { key: "audit", label: "Audit Log" },
      { key: "evidence", label: "All Evidence" },
    ],
    []
  );

  const [active, setActive] = useState<NavItem["key"]>("dashboard");
  const subtabs = useMemo<SubTab[]>(
    () => [
      { key: "pending", label: "Pending Requests" },
      { key: "activity", label: "Recent Activity" },
      { key: "health", label: "System Health" },
    ],
    []
  );
  const [subtab, setSubtab] = useState<SubTab["key"]>("pending");

  const stats = useMemo(
    () => [
      { label: "Total Users", value: 0, icon: "👥" },
      { label: "Evidence Items", value: 0, icon: "📁" },
      { label: "Pending Requests", value: 0, icon: "🟡" },
      { label: "Audit Log Entries", value: 0, icon: "🔐" },
    ],
    []
  );

  const panelTitle = useMemo(() => {
    if (active === "requests") return "Access Requests";
    if (active === "users") return "User Management";
    if (active === "audit") return "Audit Log";
    if (active === "evidence") return "All Evidence";
    return "Access Requests Waiting for Approval";
  }, [active]);

  return (
    <div className="min-h-screen w-screen bg-zinc-100 text-zinc-950">
      <div className="flex min-h-screen">
        <aside className="w-[260px] bg-[#1f6b2b] text-white">
          <div className="px-6 py-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-2xl">⚖️</div>
            <div className="mt-4 text-lg font-semibold">Juriscan</div>
            <div className="text-xs text-white/80">Admin Portal</div>
          </div>

          <nav className="px-4 pb-8">
            <div className="space-y-2">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActive(item.key)}
                  className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all duration-200 hover:bg-white/10 ${
                    active === item.key ? "bg-[#f0b429] text-[#1f6b2b]" : "text-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-6 border-t border-white/15 pt-4">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="w-full rounded-xl bg-white/10 px-4 py-3 text-left text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/15 hover:shadow-lg hover:shadow-black/20 active:translate-y-0"
              >
                Logout
              </button>
            </div>
          </nav>
        </aside>

        <main className="flex-1 px-8 py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-[#1f6b2b]">Admin Dashboard</h1>
              <p className="mt-1 text-sm text-zinc-600">Manage users, review requests, and monitor system activity</p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 shadow-sm">
              <div className="text-sm font-semibold">Admin</div>
              <div className="text-xs text-zinc-500">Account details placeholder</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-3xl font-semibold text-[#1f6b2b] tabular-nums">{s.value}</div>
                    <div className="mt-1 text-xs text-zinc-500">{s.label}</div>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-zinc-100 text-xl">{s.icon}</div>
                </div>
              </div>
            ))}
          </div>

          {active === "dashboard" ? (
            <div className="mt-6">
              <div className="flex flex-wrap gap-3">
                {subtabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setSubtab(t.key)}
                    className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 active:translate-y-0 ${
                      subtab === t.key ? "bg-[#1f6b2b] text-white" : "bg-white text-zinc-700 border border-zinc-200"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-[#1f6b2b]">{subtab === "pending" ? "Access Requests Waiting for Approval" : subtab === "activity" ? "Recent Activity" : "System Health"}</h2>
                  <button
                    type="button"
                    className="rounded-xl bg-[#1f6b2b] px-4 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 active:translate-y-0"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-600">
                  {subtab === "pending" ? "No access requests yet." : subtab === "activity" ? "No recent activity yet." : "No health alerts."}
                </div>
              </section>
            </div>
          ) : (
            <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-[#1f6b2b]">{panelTitle}</h2>
                <button
                  type="button"
                  className="rounded-xl bg-[#1f6b2b] px-4 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 active:translate-y-0"
                >
                  Refresh
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-600">
                {active === "requests" ? "No access requests yet." : null}
                {active === "users" ? "No users to manage yet." : null}
                {active === "audit" ? "No audit log entries yet." : null}
                {active === "evidence" ? "No evidence items yet." : null}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
