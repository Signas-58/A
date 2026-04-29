"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type NavItem = {
  key: "queue" | "hash" | "docket" | "history";
  label: string;
};

export default function ClerkDashboardPage() {
  const router = useRouter();

  const navItems = useMemo<NavItem[]>(
    () => [
      { key: "queue", label: "Submission Queue" },
      { key: "hash", label: "Hash Verification" },
      { key: "docket", label: "Docket Management" },
      { key: "history", label: "Verification History" },
    ],
    []
  );

  const [active, setActive] = useState<NavItem["key"]>("queue");

  const [hashToVerify, setHashToVerify] = useState("");
  const [optionalFilename, setOptionalFilename] = useState("");

  const stats = useMemo(
    () => [
      { label: "Pending Review", value: 0, icon: "🟡" },
      { label: "Verified Today", value: 0, icon: "✅" },
      { label: "Docket Entries", value: 0, icon: "📋" },
      { label: "Rejected", value: 0, icon: "❌" },
    ],
    []
  );

  const panelTitle = useMemo(() => {
    if (active === "hash") return "Hash Verification";
    if (active === "docket") return "Docket Management";
    if (active === "history") return "Verification History";
    return "Evidence Submission Queue";
  }, [active]);

  const panelIcon = useMemo(() => {
    if (active === "hash") return "🔐";
    if (active === "docket") return "📋";
    if (active === "history") return "🧾";
    return "📥";
  }, [active]);

  return (
    <div className="min-h-screen w-screen bg-zinc-100 text-zinc-950">
      <div className="flex min-h-screen">
        <aside className="w-[260px] bg-[#1f6b2b] text-white">
          <div className="px-6 py-10 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/10 text-2xl">📄</div>
            <div className="mt-5 text-lg font-semibold">Clerk Portal</div>
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
              <h1 className="text-2xl font-semibold text-[#1f6b2b]">Court Clerk Dashboard</h1>
              <p className="mt-1 text-sm text-zinc-600">Verify evidence, manage submissions, and accept into docket</p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 shadow-sm">
              <div className="text-sm font-semibold">Clerk</div>
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

          <section className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100">{panelIcon}</div>
                <h2 className="text-base font-semibold text-[#1f6b2b]">{panelTitle}</h2>
              </div>

              <button
                type="button"
                className="rounded-xl bg-[#1f6b2b] px-4 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 active:translate-y-0"
              >
                Refresh
              </button>
            </div>

            {active === "queue" ? (
              <div className="mt-5 overflow-auto rounded-2xl border border-zinc-200">
                <table className="w-full min-w-[860px] text-left text-xs">
                  <thead className="bg-zinc-50 text-zinc-700">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Filename</th>
                      <th className="px-4 py-3 font-semibold">SHA-256 Hash</th>
                      <th className="px-4 py-3 font-semibold">Submitted By</th>
                      <th className="px-4 py-3 font-semibold">Case #</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-500">
                        No submissions yet.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : active === "hash" ? (
              <div className="mt-5 space-y-6">
                <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100">🔒</div>
                      <div className="text-base font-semibold text-[#1f6b2b]">SHA-256 Hash Verification Tool</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setHashToVerify("");
                        setOptionalFilename("");
                      }}
                      className="rounded-full bg-[#f0b429] px-4 py-2 text-xs font-semibold text-[#1f6b2b] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 active:translate-y-0"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="mt-6 grid gap-5">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-zinc-700">Enter SHA-256 Hash to Verify</label>
                      <input
                        value={hashToVerify}
                        onChange={(e) => setHashToVerify(e.target.value)}
                        className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none"
                        placeholder=""
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-zinc-700">Evidence Filename (Optional)</label>
                      <input
                        value={optionalFilename}
                        onChange={(e) => setOptionalFilename(e.target.value)}
                        className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none"
                        placeholder=""
                      />
                    </div>

                    <button
                      type="button"
                      className="h-11 w-full rounded-2xl bg-[#1f6b2b] text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 active:translate-y-0"
                    >
                      Verify Hash
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100">📊</div>
                    <div className="text-base font-semibold text-[#1f6b2b]">Recent Verifications</div>
                  </div>

                  <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-600">
                    No verifications yet.
                  </div>
                </div>
              </div>
            ) : active === "docket" ? (
              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100">📋</div>
                    <div className="text-base font-semibold text-[#1f6b2b]">Docket Management</div>
                  </div>

                  <button
                    type="button"
                    className="rounded-xl bg-[#1f6b2b] px-4 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 active:translate-y-0"
                  >
                    + New Docket Entry
                  </button>
                </div>

                <div className="mt-5 overflow-auto rounded-2xl border border-zinc-200">
                  <table className="w-full min-w-[820px] text-left text-xs">
                    <thead className="bg-zinc-50 text-zinc-700">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Docket #</th>
                        <th className="px-4 py-3 font-semibold">Evidence</th>
                        <th className="px-4 py-3 font-semibold">Filed By</th>
                        <th className="px-4 py-3 font-semibold">Date</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                        <th className="px-4 py-3 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-500">
                          No docket entries yet.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : active === "history" ? (
              <div className="mt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100">🧾</div>
                    <div className="text-base font-semibold text-[#1f6b2b]">Complete Verification History</div>
                  </div>

                  <button
                    type="button"
                    className="rounded-full bg-[#f0b429] px-4 py-2 text-xs font-semibold text-[#1f6b2b] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 active:translate-y-0"
                  >
                    Export CSV
                  </button>
                </div>

                <div className="mt-5 overflow-auto rounded-2xl border border-zinc-200">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <thead className="bg-zinc-50 text-zinc-700">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Timestamp</th>
                        <th className="px-4 py-3 font-semibold">Hash</th>
                        <th className="px-4 py-3 font-semibold">Evidence</th>
                        <th className="px-4 py-3 font-semibold">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-sm text-zinc-500">
                          No verification history yet.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-600">
                No data yet.
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
