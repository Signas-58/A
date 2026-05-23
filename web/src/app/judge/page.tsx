"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";
const POLL_MS  = 12_000;

type Tab = "assigned" | "review" | "history";

type Disclosure = {
  id: number;
  docket_number: string;
  report_id: number;
  case_number: string | null;
  verdict: string | null;
  filename: string | null;
  assessment: string;
  judge_notes: string | null;
  court_date: string;
  docket_pdf_hash: string;
  evidence_pdf_hash: string | null;
  status: string;
  prosecutor_name: string | null;
  clerk_name: string | null;
  judge_name: string | null;
  judge_id: number | null;
  created_at: string;
};

type User = { id: number; username: string; email: string; role: string };

// ── helpers ──────────────────────────────────────────────────────────────────

function verdictBadge(v: string | null) {
  if (!v) return <span className="text-zinc-400 text-xs italic">None</span>;
  const vl = v.toLowerCase();
  let cls = "border-zinc-200 bg-zinc-50 text-zinc-700";
  if (vl.includes("highly") || vl.includes("high")) cls = "border-red-200 bg-red-50 text-red-800";
  else if (vl.includes("suspicious")) cls = "border-amber-200 bg-amber-50 text-amber-900";
  else if (vl.includes("real")) cls = "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{v}</span>;
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    routed:   "border-purple-200 bg-purple-50 text-purple-800",
    accepted: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rejected: "border-red-200 bg-red-50 text-red-800",
    pending:  "border-amber-200 bg-amber-50 text-amber-800",
    received: "border-blue-200 bg-blue-50 text-blue-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${map[s] ?? "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
      {s === "routed" ? "⚖️ Awaiting Review" : s}
    </span>
  );
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function JudgeDashboardPage() {
  const router = useRouter();
  const [active, setActive] = useState<Tab>("assigned");
  const [user, setUser] = useState<User | null>(null);

  const [disclosures, setDisclosures] = useState<Disclosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  // selected case for review panel
  const [reviewing, setReviewing] = useState<Disclosure | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try { const raw = localStorage.getItem("user"); if (raw) setUser(JSON.parse(raw)); } catch { /* ignore */ }
  }, []);

  const fetchDisclosures = useCallback((spinner = false) => {
    if (spinner) setLoading(true);
    setError(null);
    const uid = (() => { try { const r = localStorage.getItem("user"); return r ? JSON.parse(r).id : null; } catch { return null; } })();
    const url = uid ? `${API_BASE}/disclosures?judge_id=${uid}` : `${API_BASE}/disclosures`;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: unknown) => {
        const list = Array.isArray(data) ? (data as Disclosure[]) : [];
        setDisclosures(list);
        // keep reviewing fresh
        setReviewing(prev => prev ? (list.find(d => d.id === prev.id) ?? prev) : null);
        setLoading(false);
        setSecondsAgo(0);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { fetchDisclosures(true); }, [fetchDisclosures]);
  useEffect(() => {
    timerRef.current = setInterval(() => fetchDisclosures(false), POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchDisclosures]);
  useEffect(() => {
    tickRef.current = setInterval(() => setSecondsAgo(s => s + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  // derived
  const awaiting = disclosures.filter(d => d.status === "routed");
  const reviewed = disclosures.filter(d => d.status !== "routed");

  const stats = [
    { label: "Assigned Cases",    value: disclosures.length, icon: "⚖️"  },
    { label: "Awaiting Review",   value: awaiting.length,    icon: "🟡"  },
    { label: "Reviewed",          value: reviewed.length,    icon: "✅"  },
    { label: "Upcoming Hearings", value: awaiting.length,    icon: "📅"  },
  ];

  const navItems: { key: Tab; label: string; icon: string }[] = [
    { key: "assigned", label: "My Assigned Cases", icon: "⚖️" },
    { key: "review",   label: "Case Review",       icon: "📝" },
    { key: "history",  label: "Case History",      icon: "🧾" },
  ];

  return (
    <div className="min-h-screen w-screen bg-zinc-950 text-white">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-[260px] bg-[#1a1a2e] border-r border-white/10 text-white flex flex-col">
          <div className="px-6 py-8">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-purple-700/30 border border-purple-500/30 text-2xl">⚖️</div>
            <div className="mt-5 text-lg font-semibold">Judge Portal</div>
            <div className="text-xs text-white/60">AI Evidence Court System</div>
            {user && (
              <div className="mt-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs">
                <div className="font-semibold truncate text-white">{user.username}</div>
                <div className="text-white/50 truncate">{user.email}</div>
                <div className="mt-1 rounded-full bg-purple-700/30 border border-purple-500/30 px-2 py-0.5 text-[10px] text-purple-300 w-fit">Judge</div>
              </div>
            )}
          </div>
          <nav className="px-4 pb-8 flex-1">
            <div className="space-y-2">
              {navItems.map(item => (
                <button key={item.key} type="button" onClick={() => setActive(item.key)}
                  className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all duration-200 hover:bg-white/5 ${active === item.key ? "bg-purple-700 text-white" : "text-white/70"}`}>
                  <span className="mr-2">{item.icon}</span>{item.label}
                  {item.key === "assigned" && awaiting.length > 0 && (
                    <span className="ml-2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{awaiting.length}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-6 border-t border-white/10 pt-4">
              <button type="button" onClick={() => { localStorage.removeItem("token"); localStorage.removeItem("user"); router.push("/"); }}
                className="w-full rounded-xl bg-white/5 px-4 py-3 text-left text-sm font-semibold text-white/70 hover:bg-white/10 transition-all">
                Logout
              </button>
            </div>
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 px-8 py-8 overflow-auto">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-4">
              <h1 className="text-2xl font-bold text-white">
                <span className="text-purple-400">⚖️</span> Judge Dashboard
              </h1>
              <p className="mt-1 text-sm text-white/50">AI-verified evidence routed from court clerk for judicial review</p>
            </div>
            <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 px-6 py-4">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-purple-700 text-white text-lg">⚖️</div>
              <div>
                <div className="text-sm font-semibold text-white">{user?.username ?? "Judge"}</div>
                <div className="text-xs text-white/50">Presiding Judge | Active</div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-purple-500/30 bg-purple-900/20 px-6 py-4 text-sm text-purple-200">
            <div className="font-semibold">JUDICIAL REVIEW MODE — Cases routed by clerk with verified AI evidence</div>
            <div className="mt-1 text-purple-300/70">Each case carries an AI-generated PDF report with SHA-256 chain of custody hash</div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map(s => (
              <div key={s.label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-3xl font-semibold text-purple-400 tabular-nums">{loading ? "…" : s.value}</div>
                    <div className="mt-1 text-xs font-semibold text-white/50">{s.label}</div>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/5 border border-white/10 text-xl">{s.icon}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Panel */}
          <section className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-white/10">
                  {active === "assigned" ? "⚖️" : active === "review" ? "📝" : "🧾"}
                </div>
                <h2 className="text-base font-semibold text-purple-300">
                  {active === "assigned" ? "My Assigned Cases" : active === "review" ? "Case Review" : "Case History"}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/30">Updated {secondsAgo}s ago</span>
                <button type="button" onClick={() => fetchDisclosures(true)}
                  className="rounded-full bg-purple-700 px-4 py-2 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-700/30 transition-all">
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-5">
              {/* ASSIGNED CASES */}
              {active === "assigned" && (
                loading ? <JEmpty text="Loading…" /> :
                error   ? <JEmpty text={`Error: ${error}`} red /> :
                awaiting.length === 0 ? (
                  <JEmpty text="No cases assigned yet. The clerk will route accepted dockets to you — they will appear here automatically." />
                ) : (
                  <div className="space-y-5">
                    {awaiting.map(d => (
                      <div key={d.id} className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-700/20 border border-purple-500/30 text-lg">⚖️</div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-sm font-bold text-purple-400">{d.docket_number}</span>
                                {statusBadge(d.status)}
                              </div>
                              <div className="mt-0.5 text-xs text-white/40">
                                Case: {d.case_number ?? "—"} · Prosecutor: {d.prosecutor_name ?? "—"} · Clerk: {d.clerk_name ?? "—"}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <a href={`${API_BASE}/disclosures/${d.id}/pdf`} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-full bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-700/30 transition-all">
                              📋 Docket PDF
                            </a>
                            <a href={`${API_BASE}/reports/${d.report_id}/pdf`} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10 transition-all">
                              📄 AI Evidence PDF
                            </a>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-4">
                          <JCell label="Court Date"    value={d.court_date} />
                          <JCell label="AI Verdict"    value={d.verdict ?? "—"} />
                          <JCell label="Evidence File" value={d.filename ?? "—"} />
                          <JCell label="Routed"        value={relativeTime(d.created_at)} />
                        </div>

                        {/* Prosecutor assessment */}
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1">Prosecutor&apos;s Legal Assessment</div>
                          <div className="text-xs text-white/70 leading-relaxed">{d.assessment}</div>
                        </div>

                        {/* Clerk routing notes */}
                        {d.judge_notes && (
                          <div className="mt-3 rounded-xl border border-purple-500/20 bg-purple-900/20 px-3 py-2.5">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-purple-400/60 mb-1">Clerk Routing Notes</div>
                            <div className="text-xs text-purple-200/80 leading-relaxed">{d.judge_notes}</div>
                          </div>
                        )}

                        {/* Chain of custody hash */}
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1">AI Report SHA-256 (Chain of Custody)</div>
                          <div className="font-mono text-[10px] text-white/40 break-all">{d.evidence_pdf_hash ?? d.docket_pdf_hash}</div>
                        </div>

                        <div className="mt-4">
                          <button type="button" onClick={() => { setReviewing(d); setActive("review"); }}
                            className="w-full rounded-xl bg-purple-700 py-2.5 text-sm font-semibold text-white hover:-translate-y-0.5 hover:shadow-xl hover:shadow-purple-700/30 transition-all">
                            📝 Open Case for Review →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* CASE REVIEW */}
              {active === "review" && (
                !reviewing ? (
                  <div className="space-y-4">
                    <JEmpty text="Select a case from 'My Assigned Cases' to open it here for review." />
                    {awaiting.length > 0 && (
                      <div className="grid gap-3">
                        {awaiting.map(d => (
                          <button key={d.id} type="button" onClick={() => setReviewing(d)}
                            className="rounded-2xl border border-white/10 bg-zinc-900 p-4 text-left hover:border-purple-500/30 hover:bg-zinc-800 transition-all">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="font-mono text-sm font-bold text-purple-400">{d.docket_number}</div>
                                <div className="text-xs text-white/40 mt-0.5">Case: {d.case_number ?? "—"} · Court: {d.court_date}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                {verdictBadge(d.verdict)}
                                <span className="text-white/30 text-sm">→</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Review header */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-lg font-bold text-purple-400">{reviewing.docket_number}</span>
                          {statusBadge(reviewing.status)}
                          {verdictBadge(reviewing.verdict)}
                        </div>
                        <div className="mt-1 text-xs text-white/40">Case: {reviewing.case_number ?? "—"} · Scheduled: {reviewing.court_date}</div>
                      </div>
                      <button type="button" onClick={() => setReviewing(null)}
                        className="rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/10">
                        ← Back to list
                      </button>
                    </div>

                    {/* Chain of parties */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4 text-center">
                        <div className="text-2xl mb-2">🔎</div>
                        <div className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Investigator</div>
                        <div className="mt-1 text-sm font-semibold text-white/70">AI Analysis</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4 text-center">
                        <div className="text-2xl mb-2">⚖️</div>
                        <div className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Prosecutor</div>
                        <div className="mt-1 text-sm font-semibold text-white/70">{reviewing.prosecutor_name ?? "—"}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-zinc-900 p-4 text-center">
                        <div className="text-2xl mb-2">📄</div>
                        <div className="text-[10px] uppercase tracking-wider text-white/30 font-semibold">Clerk</div>
                        <div className="mt-1 text-sm font-semibold text-white/70">{reviewing.clerk_name ?? "—"}</div>
                      </div>
                    </div>

                    {/* Evidence block */}
                    <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="grid h-7 w-7 place-items-center rounded-lg bg-white/10">🤖</div>
                        <div className="text-sm font-semibold text-white/80">AI Evidence Summary</div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <JCell label="Evidence File" value={reviewing.filename ?? "—"} />
                        <JCell label="AI Verdict"    value={reviewing.verdict ?? "—"} />
                      </div>
                      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1">SHA-256 Chain of Custody Hash</div>
                        <div className="font-mono text-[10px] text-white/40 break-all">{reviewing.evidence_pdf_hash ?? reviewing.docket_pdf_hash}</div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <a href={`${API_BASE}/reports/${reviewing.report_id}/pdf`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full bg-purple-700 px-4 py-2 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-700/30 transition-all">
                          📄 Download AI Evidence PDF
                        </a>
                        <a href={`${API_BASE}/disclosures/${reviewing.id}/pdf`} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 transition-all">
                          📋 Download Docket PDF
                        </a>
                      </div>
                    </div>

                    {/* Prosecutor assessment */}
                    <div className="rounded-2xl border border-white/10 bg-zinc-900 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="grid h-7 w-7 place-items-center rounded-lg bg-white/10">📜</div>
                        <div className="text-sm font-semibold text-white/80">Prosecutor&apos;s Legal Assessment</div>
                      </div>
                      <p className="text-sm text-white/60 leading-relaxed">{reviewing.assessment}</p>
                    </div>

                    {/* Clerk notes */}
                    {reviewing.judge_notes && (
                      <div className="rounded-2xl border border-purple-500/20 bg-purple-900/20 p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="grid h-7 w-7 place-items-center rounded-lg bg-purple-700/30">📝</div>
                          <div className="text-sm font-semibold text-purple-300">Clerk Routing Notes</div>
                        </div>
                        <p className="text-sm text-purple-200/70 leading-relaxed">{reviewing.judge_notes}</p>
                      </div>
                    )}
                  </div>
                )
              )}

              {/* CASE HISTORY */}
              {active === "history" && (
                loading ? <JEmpty text="Loading…" /> :
                disclosures.length === 0 ? <JEmpty text="No cases assigned yet." /> : (
                  <div className="overflow-x-auto rounded-2xl border border-white/10">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-900/50 text-white/40 uppercase text-xs tracking-wider border-b border-white/10">
                        <tr>
                          <th className="px-6 py-4 text-left">Docket #</th>
                          <th className="px-6 py-4 text-left">Case #</th>
                          <th className="px-6 py-4 text-left">Verdict</th>
                          <th className="px-6 py-4 text-left">Prosecutor</th>
                          <th className="px-6 py-4 text-left">Court Date</th>
                          <th className="px-6 py-4 text-left">Status</th>
                          <th className="px-6 py-4 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {disclosures.map(d => (
                          <tr key={d.id} className="bg-zinc-950 hover:bg-zinc-900 transition-colors">
                            <td className="px-6 py-4 font-mono text-xs font-bold text-purple-400">{d.docket_number}</td>
                            <td className="px-6 py-4 font-mono text-xs text-white/50">{d.case_number ?? "—"}</td>
                            <td className="px-6 py-4">{verdictBadge(d.verdict)}</td>
                            <td className="px-6 py-4 text-xs text-white/50">{d.prosecutor_name ?? "—"}</td>
                            <td className="px-6 py-4 text-xs text-white/50 whitespace-nowrap">{d.court_date}</td>
                            <td className="px-6 py-4">{statusBadge(d.status)}</td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <button type="button" onClick={() => { setReviewing(d); setActive("review"); }}
                                  className="rounded-full bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-700/30 transition-all">
                                  📝 Review
                                </button>
                                <a href={`${API_BASE}/disclosures/${d.id}/pdf`} target="_blank" rel="noopener noreferrer"
                                  className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 transition-all">
                                  📋 Docket
                                </a>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function JEmpty({ text, red }: { text: string; red?: boolean }) {
  return (
    <div className={`rounded-2xl border px-6 py-12 text-center text-sm ${red ? "border-red-800 bg-red-900/20 text-red-400" : "border-white/10 bg-white/5 text-white/30"}`}>
      {text}
    </div>
  );
}

function JCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/30 mb-1">{label}</div>
      <div className="text-xs text-white/70 truncate">{value}</div>
    </div>
  );
}
