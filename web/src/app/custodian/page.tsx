"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type NavItem = {
  key: string;
  label: string;
};

export default function CustodianDashboardPage() {
  const router = useRouter();

  const navItems = useMemo<NavItem[]>(
    () => [
      { key: "registry", label: "Evidence Registry" },
      { key: "timeline", label: "Custody Timeline" },
      { key: "audit", label: "Audit Log" },
      { key: "seal", label: "Seal Evidence" },
    ],
    []
  );

  const [active, setActive] = useState<NavItem["key"]>("registry");

  const stats = useMemo(
    () => [
      { label: "Total Evidence Items", value: 0 },
      { label: "Sealed Items", value: 0 },
      { label: "Flagged for Review", value: 0 },
      { label: "Total Access Logs", value: 0 },
    ],
    []
  );

  const panelTitle = useMemo(() => {
    if (active === "timeline") return "Chain of Custody Timeline";
    if (active === "audit") return "Audit Log";
    if (active === "seal") return "Seal Evidence";
    return "Complete Evidence Registry";
  }, [active]);

  const panelIcon = useMemo(() => {
    if (active === "timeline") return "🧾";
    if (active === "audit") return "🗂️";
    if (active === "seal") return "🔒";
    return "📦";
  }, [active]);

  return (
    <div className="min-h-screen w-screen bg-zinc-50 text-zinc-950">
      <div className="flex min-h-screen">
        <aside className="w-[260px] bg-[#1f6b2b] text-white">
          <div className="px-6 py-8">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-2xl">📦</div>
            <div className="mt-5 text-lg font-semibold">Forensic Officer Portal</div>
            <div className="text-xs text-white/80">Chain of Custody</div>
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
              <h1 className="text-2xl font-semibold text-[#1f6b2b]">Forensic Officer Dashboard</h1>
              <p className="mt-1 text-sm text-zinc-600">Manage chain of custody, seal evidence, and monitor integrity</p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 shadow-sm">
              <div className="text-sm font-semibold">Forensic Officer</div>
              <div className="text-xs text-zinc-500">Account details placeholder</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              Forensic Officer mode active — all logs are append-only and cryptographically signed (placeholder)
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
              Chain of custody is immutable (placeholder)
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="text-3xl font-semibold text-[#1f6b2b] tabular-nums">{s.value}</div>
                <div className="mt-1 text-xs text-zinc-500">{s.label}</div>
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
                {active === "registry" ? "Export CSV" : "Refresh"}
              </button>
            </div>

            {active === "registry" ? (
              <div className="mt-5 overflow-auto rounded-2xl border border-zinc-200">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="bg-zinc-50 text-zinc-700">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Evidence ID</th>
                      <th className="px-4 py-3 font-semibold">Filename</th>
                      <th className="px-4 py-3 font-semibold">SHA-256 Hash</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Sealed</th>
                      <th className="px-4 py-3 font-semibold">Uploaded By</th>
                      <th className="px-4 py-3 font-semibold">Last Accessed</th>
                      <th className="px-4 py-3 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-zinc-500">
                        No evidence items yet.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : active === "timeline" ? (
              <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-600">
                No custody events yet.
              </div>
            ) : active === "audit" ? (
              <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-600">
                No audit entries yet.
              </div>
            ) : (
              <div className="mt-5 space-y-6">
                <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100">🔒</div>
                    <div className="text-base font-semibold text-[#1f6b2b]">Seal Evidence Package</div>
                  </div>

                  <div className="mt-6 grid gap-5">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-zinc-700">Select Evidence to Seal</label>
                      <select
                        className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none"
                        disabled
                        value=""
                        onChange={() => undefined}
                      >
                        <option value="">-- Select evidence to seal --</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-zinc-700">Sealing Officer</label>
                      <input
                        className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none"
                        value=""
                        onChange={() => undefined}
                        placeholder=""
                        disabled
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-zinc-700">Sealing Reason</label>
                      <textarea
                        className="min-h-[110px] w-full resize-none rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-sm outline-none"
                        value=""
                        onChange={() => undefined}
                        placeholder="Enter reason for sealing this evidence..."
                        disabled
                      />
                    </div>

                    <button
                      type="button"
                      disabled
                      className="h-11 w-full rounded-2xl bg-[#1f6b2b] text-sm font-semibold text-white opacity-60"
                    >
                      Seal Evidence
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100">📄</div>
                    <div className="text-base font-semibold text-[#1f6b2b]">Recently Sealed Items</div>
                  </div>

                  <div className="mt-5 overflow-auto rounded-2xl border border-zinc-200">
                    <table className="w-full min-w-[700px] text-left text-xs">
                      <thead className="bg-zinc-50 text-zinc-700">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Evidence ID</th>
                          <th className="px-4 py-3 font-semibold">Filename</th>
                          <th className="px-4 py-3 font-semibold">Sealed By</th>
                          <th className="px-4 py-3 font-semibold">Sealed At</th>
                          <th className="px-4 py-3 font-semibold">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-500">
                            No sealed items yet.
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
