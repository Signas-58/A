"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ProsecutorTab = "cases" | "library" | "reports" | "disclosure" | "preparation";

type NavItem = {
  key: ProsecutorTab;
  label: string;
  icon: string;
};

type StatCard = {
  label: string;
  value: number;
  icon: string;
};

export default function ProsecutorPage() {
  const router = useRouter();
  const [active, setActive] = useState<ProsecutorTab>("cases");

  const navItems: NavItem[] = useMemo(
    () => [
      { key: "cases", label: "My Cases", icon: "📄" },
      { key: "library", label: "Evidence Library", icon: "🔎" },
      { key: "reports", label: "AI Verification Reports", icon: "🤖" },
      { key: "disclosure", label: "Disclosure Requests", icon: "📩" },
      { key: "preparation", label: "Court Preparation", icon: "⚖️" },
    ],
    []
  );

  const stats: StatCard[] = useMemo(
    () => [
      { label: "Active Cases", value: 0, icon: "📋" },
      { label: "Available Evidence", value: 0, icon: "📦" },
      { label: "AI-Verified Items", value: 0, icon: "🤖" },
      { label: "Upcoming Hearings", value: 0, icon: "🗓️" },
    ],
    []
  );

  const panelTitle = useMemo(() => {
    if (active === "cases") return "Active Criminal Cases";
    if (active === "library") return "Evidence Library";
    if (active === "reports") return "AI Verification Reports";
    if (active === "disclosure") return "Disclosure Requests";
    return "Court Preparation";
  }, [active]);

  const panelIcon = useMemo(() => {
    if (active === "cases") return "📋";
    if (active === "library") return "📚";
    if (active === "reports") return "🤖";
    if (active === "disclosure") return "📩";
    return "⚖️";
  }, [active]);

  return (
    <div className="min-h-screen w-screen bg-zinc-50 text-zinc-950">
      <div className="flex min-h-screen">
        <aside className="w-[260px] bg-[#1f6b2b] text-white">
          <div className="px-6 py-8">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-2xl">⚖️</div>
            <div className="mt-5 text-lg font-semibold">Prosecutor Portal</div>
            <div className="text-xs text-white/80">Case Management &amp; Evidence</div>
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
                  <span className="mr-2 inline-block w-5 text-center">{item.icon}</span>
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
            <div className="rounded-3xl border border-zinc-200 bg-white px-6 py-4 shadow-sm">
              <h1 className="text-2xl font-semibold text-[#1f6b2b]">Prosecutor Dashboard</h1>
              <p className="mt-1 text-sm text-zinc-600">Build and present legal cases with AI-verified evidence</p>
            </div>

            <div className="flex items-center gap-3 rounded-3xl border border-zinc-200 bg-white px-6 py-4 shadow-sm">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[#1f6b2b] text-white">⚖️</div>
              <div>
                <div className="text-sm font-semibold">Account</div>
                <div className="text-xs text-zinc-500">Prosecutor | 2FA Enabled (placeholder)</div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-900">
            <div className="font-semibold">PROSECUTOR MODE ACTIVE - Evidence disclosed is tracked for chain of custody</div>
            <div className="mt-2">AI-Verified evidence marked with badge (placeholder)</div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-3xl font-semibold text-[#1f6b2b] tabular-nums">{s.value}</div>
                    <div className="mt-1 text-xs font-semibold text-zinc-600">{s.label}</div>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-zinc-100 text-xl">{s.icon}</div>
                </div>
              </div>
            ))}
          </div>

          <section className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100">{panelIcon}</div>
                <h2 className="text-base font-semibold text-[#1f6b2b]">{panelTitle}</h2>
              </div>

              <button
                type="button"
                className="rounded-full bg-[#1f6b2b] px-4 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 active:translate-y-0"
              >
                Refresh
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-600">
              No data yet.
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
