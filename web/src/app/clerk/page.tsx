"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";
const POLL_MS = 10_000;

type Tab = "queue" | "hash" | "docket" | "history";

type Disclosure = {
  id: number;
  docket_number: string;
  report_id: number;
  case_number: string | null;
  verdict: string | null;
  filename: string | null;
  assessment: string;
  court_date: string;
  docket_pdf_hash: string;
  evidence_pdf_hash: string | null;
  status: string;
  prosecutor_name: string | null;
  clerk_name: string | null;
  created_at: string;
};

type User = { id: number; username: string; email: string; role: string };

// ── helpers ──────────────────────────────────────────────────────────────────

function verdictBadge(v: string | null) {
  if (!v) return <span className="text-zinc-400 text-xs">—</span>;
  const vl = v.toLowerCase();
  let cls = "border-zinc-200 bg-zinc-50 text-zinc-700";
  if (vl.includes("highly") || vl.includes("high")) cls = "border-red-200 bg-red-50 text-red-800";
  else if (vl.includes("suspicious")) cls = "border-amber-200 bg-amber-50 text-amber-900";
  else if (vl.includes("real")) cls = "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{v}</span>;
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    pending: "border-amber-200 bg-amber-50 text-amber-800",
    received: "border-blue-200 bg-blue-50 text-blue-800",
    accepted: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rejected: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${map[s] ?? "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
      {s}
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

export default function ClerkDashboardPage() {
  const router = useRouter();
  const [active, setActive] = useState<Tab>("queue");
  const [user, setUser] = useState<User | null>(null);

  const [disclosures, setDisclosures] = useState<Disclosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  // hash verification state
  const [hashInput, setHashInput] = useState("");
  const [hashResult, setHashResult] = useState<{ match: boolean; docket: Disclosure } | null>(null);
  const [hashSearched, setHashSearched] = useState(false);

  // status update tracking
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // load user
  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) setUser(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const fetchDisclosures = useCallback((spinner = false) => {
    if (spinner) setLoading(true);
    setError(null);
    const uid = (() => {
      try { const raw = localStorage.getItem("user"); return raw ? JSON.parse(raw).id : null; } catch { return null; }
    })();
    const url = uid ? `${API_BASE}/disclosures?clerk_id=${uid}` : `${API_BASE}/disclosures`;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: unknown) => {
        setDisclosures(Array.isArray(data) ? (data as Disclosure[]) : []);
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

  async function updateStatus(id: number, status: string) {
    setUpdatingId(id);
    try {
      await fetch(`${API_BASE}/disclosures/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetchDisclosures(false);
    } catch { /* ignore */ } finally {
      setUpdatingId(null);
    }
  }

  function verifyHash() {
    const needle = hashInput.trim().toLowerCase();
    if (!needle) return;
    const found = disclosures.find(
      d => d.docket_pdf_hash.toLowerCase() === needle || d.evidence_pdf_hash?.toLowerCase() === needle
    );
    if (found) {
      setHashResult({ match: true, docket: found });
    } else {
      setHashResult(null);
    }
    setHashSearched(true);
  }

  // derived
  const pending = disclosures.filter(d => d.status === "pending");
  const received = disclosures.filter(d => d.status === "received");
  const accepted = disclosures.filter(d => d.status === "accepted");
  const queue = [...pending, ...received];

  const stats = [
    { label: "Pending Review", value: pending.length, icon: "🟡" },
    { label: "Received", value: received.length, icon: "📬" },
    { label: "Accepted (Docket)", value: accepted.length, icon: "✅" },
    { label: "Total Disclosures", value: disclosures.length, icon: "📋" },
  ];

  const navItems: { key: Tab; label: string; icon: string }[] = [
    { key: "queue", label: "Submission Queue", icon: "📥" },
    { key: "hash", label: "Hash Verification", icon: "🔐" },
    { key: "docket", label: "Docket Management", icon: "📋" },
    { key: "history", label: "Verification History", icon: "🧾" },
  ];

  const panelTitle = active === "hash" ? "Hash Verification" : active === "docket" ? "Docket Management" : active === "history" ? "Verification History" : "Evidence Submission Queue";
  const panelIcon = active === "hash" ? "🔐" : active === "docket" ? "📋" : active === "history" ? "🧾" : "📥";

  return (
    <div className="min-h-screen w-screen bg-zinc-50 text-zinc-950">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-[260px] bg-[#1f6b2b] text-white flex flex-col">
          <div className="px-6 py-8">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-2xl">📄</div>
            <div className="mt-5 text-lg font-semibold">Clerk Portal</div>
            <div className="text-xs text-white/80">Docket &amp; Evidence Management</div>
            {user && (
              <div className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-white/90">
                <div className="font-semibold truncate">{user.username}</div>
                <div className="text-white/60 truncate">{user.email}</div>
              </div>
            )}
          </div>
          <nav className="px-4 pb-8 flex-1">
            <div className="space-y-2">
              {navItems.map(item => (
                <button key={item.key} type="button" onClick={() => setActive(item.key)}
                  className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all duration-200 hover:bg-white/10 ${active === item.key ? "bg-[#f0b429] text-[#1f6b2b]" : "text-white"}`}>
                  <span className="mr-2">{item.icon}</span>{item.label}
                  {item.key === "queue" && queue.length > 0 && (
                    <span className="ml-2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{queue.length}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-6 border-t border-white/15 pt-4">
              <button type="button"
                onClick={() => { localStorage.removeItem("token"); localStorage.removeItem("user"); router.push("/"); }}
                className="w-full rounded-xl bg-white/10 px-4 py-3 text-left text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-white/15 transition-all">
                Logout
              </button>
            </div>
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 px-8 py-8 overflow-auto">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="rounded-3xl border border-zinc-200 bg-white px-6 py-4 shadow-sm">
              <h1 className="text-2xl font-semibold text-[#1f6b2b]">Court Clerk Dashboard</h1>
              <p className="mt-1 text-sm text-zinc-600">Verify evidence, manage submissions, and accept into docket</p>
            </div>
            <div className="flex items-center gap-3 rounded-3xl border border-zinc-200 bg-white px-6 py-4 shadow-sm">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[#1f6b2b] text-white text-lg">📄</div>
              <div>
                <div className="text-sm font-semibold">{user?.username ?? "Clerk"}</div>
                <div className="text-xs text-zinc-500">Court Clerk | Active</div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 px-6 py-4 text-sm text-blue-900">
            <div className="font-semibold">CLERK MODE — Dockets forwarded by prosecutors appear in Submission Queue</div>
            <div className="mt-1 text-blue-700">Auto-refreshes every 10s · Verify hash integrity before accepting</div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map(s => (
              <div key={s.label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-3xl font-semibold text-[#1f6b2b] tabular-nums">{loading ? "…" : s.value}</div>
                    <div className="mt-1 text-xs font-semibold text-zinc-600">{s.label}</div>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-zinc-100 text-xl">{s.icon}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Panel */}
          <section className="mt-8 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100">{panelIcon}</div>
                <h2 className="text-base font-semibold text-[#1f6b2b]">{panelTitle}</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-400">Updated {secondsAgo}s ago · auto-refreshes</span>
                <button type="button" onClick={() => fetchDisclosures(true)}
                  className="rounded-full bg-[#1f6b2b] px-4 py-2 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 transition-all">
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-5">
              {/* ── SUBMISSION QUEUE ── */}
              {active === "queue" && (
                loading ? <EmptyState text="Loading…" /> :
                error ? <EmptyState text={`Error: ${error}`} red /> :
                queue.length === 0 ? <EmptyState text="No pending submissions. Disclosures forwarded by prosecutors will appear here automatically." /> : (
                  <div className="space-y-4">
                    {queue.map(d => (
                      <div key={d.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#1f6b2b]/10 text-lg">📩</div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-sm font-bold text-[#1f6b2b]">{d.docket_number}</span>
                                {statusBadge(d.status)}
                                {verdictBadge(d.verdict)}
                              </div>
                              <div className="mt-0.5 text-xs text-zinc-500">
                                Case: {d.case_number ?? "—"} · From: {d.prosecutor_name ?? "—"} · Filed {relativeTime(d.created_at)}
                              </div>
                            </div>
                          </div>
                          <a href={`${API_BASE}/disclosures/${d.id}/pdf`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-[#1f6b2b] px-3 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 transition-all">
                            📋 Docket PDF
                          </a>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <InfoCell label="Court Date" value={d.court_date} />
                          <InfoCell label="Evidence File" value={d.filename ?? "—"} />
                          <InfoCell label="AI Verdict" value={d.verdict ?? "—"} />
                        </div>

                        {/* Assessment preview */}
                        <div className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Prosecutor Assessment</div>
                          <div className="text-xs text-zinc-600 line-clamp-3">{d.assessment}</div>
                        </div>

                        {/* Hash */}
                        <div className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Docket SHA-256 Hash</div>
                          <div className="font-mono text-[10px] text-zinc-500 break-all">{d.docket_pdf_hash}</div>
                        </div>

                        {/* Actions */}
                        <div className="mt-4 flex flex-wrap gap-2">
                          {d.status === "pending" && (
                            <button type="button" disabled={updatingId === d.id}
                              onClick={() => updateStatus(d.id, "received")}
                              className="rounded-full border border-blue-300 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 transition-all disabled:opacity-50">
                              {updatingId === d.id ? "Updating…" : "📬 Mark Received"}
                            </button>
                          )}
                          {d.status === "received" && (
                            <button type="button" disabled={updatingId === d.id}
                              onClick={() => updateStatus(d.id, "accepted")}
                              className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition-all disabled:opacity-50">
                              {updatingId === d.id ? "Updating…" : "✅ Accept into Docket"}
                            </button>
                          )}
                          <button type="button"
                            onClick={() => { setHashInput(d.docket_pdf_hash); setActive("hash"); setHashResult(null); setHashSearched(false); }}
                            className="rounded-full border border-zinc-300 bg-zinc-50 px-4 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition-all">
                            🔐 Verify Hash
                          </button>
                          <button type="button" disabled={updatingId === d.id}
                            onClick={() => updateStatus(d.id, "rejected")}
                            className="rounded-full border border-red-200 bg-red-50 px-4 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-all disabled:opacity-50">
                            ✕ Reject
                          </button>
                          <a href={`${API_BASE}/reports/${d.report_id}/pdf`} target="_blank" rel="noopener noreferrer"
                            className="rounded-full border border-zinc-300 bg-zinc-50 px-4 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition-all">
                            📄 AI Evidence PDF
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* ── HASH VERIFICATION ── */}
              {active === "hash" && (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-5">
                      <div className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100">🔒</div>
                      <div className="text-base font-semibold text-[#1f6b2b]">SHA-256 Hash Verification Tool</div>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-zinc-700">Enter Docket or Evidence SHA-256 Hash</label>
                        <input value={hashInput} onChange={e => setHashInput(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && verifyHash()}
                          className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 font-mono text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-[#1f6b2b] focus:ring-2 focus:ring-[#1f6b2b]/15"
                          placeholder="Paste SHA-256 hash here…" />
                      </div>
                      <div className="flex gap-3">
                        <button type="button" onClick={verifyHash}
                          className="flex-1 h-11 rounded-2xl bg-[#1f6b2b] text-sm font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 transition-all">
                          Verify Hash
                        </button>
                        <button type="button" onClick={() => { setHashInput(""); setHashResult(null); setHashSearched(false); }}
                          className="rounded-2xl border border-zinc-200 px-5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 transition-all">
                          Clear
                        </button>
                      </div>
                    </div>

                    {hashSearched && (
                      <div className={`mt-5 rounded-2xl border p-5 ${hashResult ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                        {hashResult ? (
                          <div>
                            <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                              <span className="text-xl">✅</span> Hash Verified — Chain of Custody Intact
                            </div>
                            <div className="mt-3 space-y-1 text-xs text-emerald-700">
                              <div><span className="font-semibold">Docket #:</span> {hashResult.docket.docket_number}</div>
                              <div><span className="font-semibold">Case #:</span> {hashResult.docket.case_number ?? "—"}</div>
                              <div><span className="font-semibold">Verdict:</span> {hashResult.docket.verdict ?? "—"}</div>
                              <div><span className="font-semibold">Court Date:</span> {hashResult.docket.court_date}</div>
                              <div><span className="font-semibold">Status:</span> {hashResult.docket.status}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-red-800 font-semibold">
                            <span className="text-xl">❌</span> Hash Not Found — No matching docket or evidence record
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Recent verifiable dockets */}
                  <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100">📊</div>
                      <div className="text-base font-semibold text-[#1f6b2b]">My Dockets &amp; Hashes</div>
                    </div>
                    {disclosures.length === 0 ? (
                      <EmptyState text="No dockets assigned yet." />
                    ) : (
                      <div className="space-y-3">
                        {disclosures.map(d => (
                          <div key={d.id} className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-semibold text-[#1f6b2b]">{d.docket_number}</span>
                              {statusBadge(d.status)}
                            </div>
                            <div className="mt-2 text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">Docket Hash</div>
                            <div className="font-mono text-[10px] text-zinc-500 break-all">{d.docket_pdf_hash}</div>
                            {d.evidence_pdf_hash && (
                              <>
                                <div className="mt-1.5 text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">Evidence (AI Report) Hash</div>
                                <div className="font-mono text-[10px] text-zinc-500 break-all">{d.evidence_pdf_hash}</div>
                              </>
                            )}
                            <button type="button" onClick={() => { setHashInput(d.docket_pdf_hash); verifyHash(); }}
                              className="mt-2 rounded-full border border-zinc-300 bg-white px-3 py-1 text-[10px] font-semibold text-zinc-600 hover:bg-zinc-100 transition-all">
                              Quick Verify
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── DOCKET MANAGEMENT ── */}
              {active === "docket" && (
                loading ? <EmptyState text="Loading…" /> :
                accepted.length === 0 ? <EmptyState text="No accepted dockets yet. Accept submissions from the queue to see them here." /> : (
                  <div className="overflow-x-auto rounded-2xl border border-zinc-200">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 text-zinc-500 uppercase text-xs tracking-wider border-b border-zinc-200">
                        <tr>
                          <th className="px-5 py-3 text-left">Docket #</th>
                          <th className="px-5 py-3 text-left">Case #</th>
                          <th className="px-5 py-3 text-left">Verdict</th>
                          <th className="px-5 py-3 text-left">Prosecutor</th>
                          <th className="px-5 py-3 text-left">Court Date</th>
                          <th className="px-5 py-3 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {accepted.map(d => (
                          <tr key={d.id} className="hover:bg-zinc-50 transition-colors">
                            <td className="px-5 py-4 font-mono font-semibold text-[#1f6b2b] text-xs">{d.docket_number}</td>
                            <td className="px-5 py-4 font-mono text-xs text-zinc-600">{d.case_number ?? "—"}</td>
                            <td className="px-5 py-4">{verdictBadge(d.verdict)}</td>
                            <td className="px-5 py-4 text-xs text-zinc-500">{d.prosecutor_name ?? "—"}</td>
                            <td className="px-5 py-4 text-xs text-zinc-500 whitespace-nowrap">{d.court_date}</td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <a href={`${API_BASE}/disclosures/${d.id}/pdf`} target="_blank" rel="noopener noreferrer"
                                  className="rounded-full bg-[#1f6b2b] px-3 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 transition-all">
                                  📋 Docket
                                </a>
                                <a href={`${API_BASE}/reports/${d.report_id}/pdf`} target="_blank" rel="noopener noreferrer"
                                  className="rounded-full border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition-all">
                                  📄 Evidence
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

              {/* ── VERIFICATION HISTORY ── */}
              {active === "history" && (
                loading ? <EmptyState text="Loading…" /> :
                disclosures.length === 0 ? <EmptyState text="No docket history yet." /> : (
                  <div className="overflow-x-auto rounded-2xl border border-zinc-200">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 text-zinc-500 uppercase text-xs tracking-wider border-b border-zinc-200">
                        <tr>
                          <th className="px-5 py-3 text-left">Docket #</th>
                          <th className="px-5 py-3 text-left">Case #</th>
                          <th className="px-5 py-3 text-left">Verdict</th>
                          <th className="px-5 py-3 text-left">Status</th>
                          <th className="px-5 py-3 text-left">Court Date</th>
                          <th className="px-5 py-3 text-left">Filed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {disclosures.map(d => (
                          <tr key={d.id} className="hover:bg-zinc-50 transition-colors">
                            <td className="px-5 py-4 font-mono text-xs font-semibold text-[#1f6b2b]">{d.docket_number}</td>
                            <td className="px-5 py-4 font-mono text-xs text-zinc-600">{d.case_number ?? "—"}</td>
                            <td className="px-5 py-4">{verdictBadge(d.verdict)}</td>
                            <td className="px-5 py-4">{statusBadge(d.status)}</td>
                            <td className="px-5 py-4 text-xs text-zinc-500">{d.court_date}</td>
                            <td className="px-5 py-4 text-xs text-zinc-400">{relativeTime(d.created_at)}</td>
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

function EmptyState({ text, red }: { text: string; red?: boolean }) {
  return (
    <div className={`rounded-2xl border px-6 py-10 text-center text-sm ${red ? "border-red-200 bg-red-50 text-red-700" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
      {text}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">{label}</div>
      <div className="text-xs text-zinc-700 truncate">{value}</div>
    </div>
  );
}
