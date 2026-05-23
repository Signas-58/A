"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";
const POLL_MS = 10_000;

type Tab = "review" | "registry" | "history";

type Report = {
  id: number;
  case_number: string;
  investigator_id: number;
  prosecutor_id: number;
  custodian_id: number | null;
  pdf_hash: string;
  verdict: string | null;
  filename: string | null;
  score: number | null;
  report_status: string;
  override_by: number | null;
  override_notes: string | null;
  has_video: boolean;
  video_filename: string | null;
  created_at: string;
};

type User = { id: number; username: string; email: string; role: string };

// ── helpers ──────────────────────────────────────────────────────────────────

function scoreBar(score: number | null) {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "bg-red-500" : pct >= 30 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-32 rounded-full bg-zinc-200 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-bold ${pct >= 70 ? "text-red-600" : pct >= 30 ? "text-amber-600" : "text-emerald-600"}`}>
        {pct}%
      </span>
    </div>
  );
}

function verdictBadge(v: string | null) {
  if (!v) return <span className="text-zinc-400 text-xs italic">—</span>;
  const vl = v.toLowerCase();
  let cls = "border-zinc-200 bg-zinc-50 text-zinc-700";
  if (vl.includes("highly") || vl.includes("high")) cls = "border-red-200 bg-red-50 text-red-800";
  else if (vl.includes("suspicious")) cls = "border-amber-200 bg-amber-50 text-amber-900";
  else if (vl.includes("real")) cls = "border-emerald-200 bg-emerald-50 text-emerald-800";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{v}</span>;
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    pending_forensic_review: "border-amber-200 bg-amber-50 text-amber-800",
    override_accepted:       "border-purple-200 bg-purple-50 text-purple-800",
    override_rejected:       "border-red-200 bg-red-50 text-red-800",
    forwarded_to_prosecutor: "border-blue-200 bg-blue-50 text-blue-800",
  };
  const labels: Record<string, string> = {
    pending_forensic_review: "🔬 Pending Review",
    override_accepted:       "✅ Override Accepted",
    override_rejected:       "❌ Override Rejected",
    forwarded_to_prosecutor: "📤 Forwarded",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${map[s] ?? "border-zinc-200 bg-zinc-50 text-zinc-600"}`}>
      {labels[s] ?? s}
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

export default function CustodianDashboardPage() {
  const router = useRouter();
  const [active, setActive] = useState<Tab>("review");
  const [user, setUser] = useState<User | null>(null);

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  // override modal
  const [overrideModal, setOverrideModal] = useState<Report | null>(null);
  const [overrideAction, setOverrideAction] = useState<"accept_override" | "reject_override">("accept_override");
  const [overrideNotes, setOverrideNotes] = useState("");
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideResult, setOverrideResult] = useState<{ message: string; routed_to: string } | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try { const raw = localStorage.getItem("user"); if (raw) setUser(JSON.parse(raw)); } catch { /* ignore */ }
  }, []);

  const fetchReports = useCallback((spinner = false) => {
    if (spinner) setLoading(true);
    setError(null);
    const uid = (() => { try { const r = localStorage.getItem("user"); return r ? JSON.parse(r).id : null; } catch { return null; } })();
    const url = uid ? `${API_BASE}/reports?custodian_id=${uid}` : `${API_BASE}/reports`;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: unknown) => { setReports(Array.isArray(data) ? (data as Report[]) : []); setLoading(false); setSecondsAgo(0); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => { fetchReports(true); }, [fetchReports]);
  useEffect(() => {
    timerRef.current = setInterval(() => fetchReports(false), POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchReports]);
  useEffect(() => {
    tickRef.current = setInterval(() => setSecondsAgo(s => s + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  async function submitOverride() {
    if (!overrideModal || !user) return;
    setOverrideSubmitting(true);
    setOverrideError(null);
    try {
      const res = await fetch(`${API_BASE}/reports/${overrideModal.id}/forensic-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: overrideAction,
          custodian_id: user.id,
          override_notes: overrideNotes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
      setOverrideResult({ message: data.message, routed_to: data.routed_to });
      fetchReports(false);
    } catch (e: unknown) {
      setOverrideError(e instanceof Error ? e.message : "Unknown error");
    } finally { setOverrideSubmitting(false); }
  }

  function openOverrideModal(r: Report, action: "accept_override" | "reject_override") {
    setOverrideModal(r);
    setOverrideAction(action);
    setOverrideNotes("");
    setOverrideError(null);
    setOverrideResult(null);
  }

  const pending  = reports.filter(r => r.report_status === "pending_forensic_review");
  const reviewed = reports.filter(r => r.report_status !== "pending_forensic_review");

  const stats = [
    { label: "Pending Review",    value: pending.length,             icon: "🔬" },
    { label: "Override Accepted", value: reviewed.filter(r => r.report_status === "override_accepted").length, icon: "✅" },
    { label: "Override Rejected", value: reviewed.filter(r => r.report_status === "override_rejected").length, icon: "❌" },
    { label: "Total Assigned",    value: reports.length,             icon: "📋" },
  ];

  const navItems: { key: Tab; label: string; icon: string }[] = [
    { key: "review",   label: "Forensic Review Queue", icon: "🔬" },
    { key: "registry", label: "Evidence Registry",     icon: "📦" },
    { key: "history",  label: "Review History",        icon: "🧾" },
  ];

  return (
    <div className="min-h-screen w-screen bg-zinc-50 text-zinc-950">
      {/* ── Override modal ── */}
      {overrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-8 shadow-2xl">
            {!overrideResult ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className={`text-lg font-semibold ${overrideAction === "accept_override" ? "text-purple-700" : "text-red-700"}`}>
                      {overrideAction === "accept_override" ? "✅ Accept Manual Override" : "❌ Reject Manual Override"}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-zinc-500">Case #{overrideModal.case_number}</div>
                  </div>
                  <button onClick={() => setOverrideModal(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200">✕</button>
                </div>

                {/* What this means */}
                <div className={`mt-4 rounded-2xl border p-4 text-xs ${overrideAction === "accept_override" ? "border-purple-200 bg-purple-50 text-purple-900" : "border-red-200 bg-red-50 text-red-900"}`}>
                  {overrideAction === "accept_override" ? (
                    <><div className="font-semibold mb-1">Accepting this override means:</div>
                    <div>You are certifying that despite the AI score of <strong>{overrideModal.score !== null ? `${Math.round(overrideModal.score * 100)}%` : "N/A"}</strong>, the video evidence is <strong>authentic and admissible</strong>. The report will be forwarded to the court clerk.</div></>
                  ) : (
                    <><div className="font-semibold mb-1">Rejecting this override means:</div>
                    <div>You are confirming the AI verdict is correct. The video evidence is <strong>NOT admissible in court</strong>. The report will be sent to the prosecutor as rejected evidence.</div></>
                  )}
                </div>

                {/* Case summary */}
                <div className="mt-4 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 space-y-1.5 text-xs text-zinc-600">
                  <div className="flex justify-between"><span className="font-semibold">AI Verdict</span>{verdictBadge(overrideModal.verdict)}</div>
                  <div className="flex justify-between items-center"><span className="font-semibold">AI Score</span>{scoreBar(overrideModal.score)}</div>
                  <div className="flex justify-between"><span className="font-semibold">File</span><span className="truncate max-w-[200px]">{overrideModal.filename ?? "—"}</span></div>
                </div>

                {/* Notes */}
                <div className="mt-4 space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700">Forensic Review Notes <span className="text-red-500">*</span></label>
                  <textarea
                    value={overrideNotes}
                    onChange={e => setOverrideNotes(e.target.value)}
                    rows={4}
                    placeholder={overrideAction === "accept_override"
                      ? "Document your findings that support overriding the AI verdict…"
                      : "Document why you are confirming the AI verdict and rejecting the evidence…"}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-[#1f6b2b] focus:ring-2 focus:ring-[#1f6b2b]/15 resize-none"
                  />
                </div>

                {overrideError && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">{overrideError}</div>
                )}

                <div className="mt-6 flex gap-3">
                  <button onClick={() => setOverrideModal(null)} className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">
                    Cancel
                  </button>
                  <button
                    onClick={submitOverride}
                    disabled={overrideSubmitting || !overrideNotes.trim()}
                    className={`flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:translate-y-0 disabled:cursor-not-allowed ${
                      overrideAction === "accept_override"
                        ? "bg-purple-700 hover:shadow-purple-700/25"
                        : "bg-red-600 hover:shadow-red-600/25"
                    }`}
                  >
                    {overrideSubmitting ? "Submitting…" : overrideAction === "accept_override" ? "✅ Confirm Accept" : "❌ Confirm Reject"}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4">
                <div className={`mx-auto grid h-16 w-16 place-items-center rounded-full text-3xl ${overrideResult.routed_to === "clerk" ? "bg-purple-100" : "bg-red-100"}`}>
                  {overrideResult.routed_to === "clerk" ? "✅" : "❌"}
                </div>
                <div className={`mt-4 text-lg font-semibold ${overrideResult.routed_to === "clerk" ? "text-purple-800" : "text-red-800"}`}>
                  {overrideResult.routed_to === "clerk" ? "Override Accepted" : "Override Rejected"}
                </div>
                <div className="mt-2 text-sm text-zinc-500 leading-relaxed max-w-sm mx-auto">{overrideResult.message}</div>
                <div className="mt-4 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
                  <span className="font-semibold">Routed to:</span>{" "}
                  <span className={`font-bold ${overrideResult.routed_to === "clerk" ? "text-purple-700" : "text-red-700"}`}>
                    {overrideResult.routed_to === "clerk" ? "🏛 Court Clerk" : "⚖️ Prosecutor (Not Admissible)"}
                  </span>
                </div>
                <button onClick={() => setOverrideModal(null)} className="mt-6 w-full rounded-xl bg-[#1f6b2b] py-2.5 text-sm font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 transition-all">
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-[260px] bg-[#1f6b2b] text-white flex flex-col">
          <div className="px-6 py-8">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-2xl">🔬</div>
            <div className="mt-5 text-lg font-semibold">Forensic Portal</div>
            <div className="text-xs text-white/80">AI Evidence Manual Review</div>
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
                  {item.key === "review" && pending.length > 0 && (
                    <span className="ml-2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{pending.length}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="mt-6 border-t border-white/15 pt-4">
              <button type="button" onClick={() => { localStorage.removeItem("token"); localStorage.removeItem("user"); router.push("/"); }}
                className="w-full rounded-xl bg-white/10 px-4 py-3 text-left text-sm font-semibold text-white hover:-translate-y-0.5 hover:bg-white/15 transition-all">
                Logout
              </button>
            </div>
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 px-8 py-8 overflow-auto">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="rounded-3xl border border-zinc-200 bg-white px-6 py-4 shadow-sm">
              <h1 className="text-2xl font-semibold text-[#1f6b2b]">Forensic Officer Dashboard</h1>
              <p className="mt-1 text-sm text-zinc-600">Review AI reports flagged for manual examination — score ≥ 30%</p>
            </div>
            <div className="flex items-center gap-3 rounded-3xl border border-zinc-200 bg-white px-6 py-4 shadow-sm">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[#1f6b2b] text-white text-lg">🔬</div>
              <div>
                <div className="text-sm font-semibold">{user?.username ?? "Forensic Officer"}</div>
                <div className="text-xs text-zinc-500">Forensic Officer | Active</div>
              </div>
            </div>
          </div>

          {/* Triage info */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900">
              <div className="font-semibold">✅ Score &lt; 30% — Auto-routed to Prosecutor</div>
              <div className="mt-0.5 text-xs text-emerald-700">Likely real. No forensic review needed.</div>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
              <div className="font-semibold">🔬 Score ≥ 30% — Sent HERE for Manual Review</div>
              <div className="mt-0.5 text-xs text-amber-700">Suspicious. You compare AI report vs. raw evidence and decide.</div>
            </div>
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
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-zinc-100">
                  {active === "review" ? "🔬" : active === "registry" ? "📦" : "🧾"}
                </div>
                <h2 className="text-base font-semibold text-[#1f6b2b]">
                  {active === "review" ? "Forensic Review Queue" : active === "registry" ? "Evidence Registry" : "Review History"}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-400">Updated {secondsAgo}s ago</span>
                <button type="button" onClick={() => fetchReports(true)}
                  className="rounded-full bg-[#1f6b2b] px-4 py-2 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 transition-all">
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-5">
              {/* FORENSIC REVIEW QUEUE */}
              {active === "review" && (
                loading ? <FEmpty text="Loading…" /> :
                error   ? <FEmpty text={`Error: ${error}`} red /> :
                pending.length === 0 ? (
                  <FEmpty text="No pending forensic reviews. Videos scoring ≥ 30% will appear here automatically." />
                ) : (
                  <div className="space-y-5">
                    {pending.map(r => (
                      <div key={r.id} className="rounded-2xl border border-amber-200 bg-amber-50/30 p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-xl">🔬</div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-sm font-bold text-[#1f6b2b]">Case #{r.case_number}</span>
                                {statusBadge(r.report_status)}
                                {verdictBadge(r.verdict)}
                              </div>
                              <div className="mt-0.5 text-xs text-zinc-500">
                                File: {r.filename ?? "—"} · {relativeTime(r.created_at)}
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                          <a href={`${API_BASE}/reports/${r.id}/pdf`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-[#1f6b2b] px-3 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 transition-all">
                            📄 AI Report PDF
                          </a>
                          {r.has_video && (
                            <a href={`${API_BASE}/reports/${r.id}/video`} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/25 transition-all">
                              📹 Download Video Evidence
                            </a>
                          )}
                        </div>
                        </div>

                        {/* Score prominently */}
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div>
                              <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-1">AI Confidence Score (triggered forensic review)</div>
                              {scoreBar(r.score)}
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-amber-700 font-semibold">THRESHOLD</div>
                              <div className="text-xs text-amber-800">Score ≥ 30% → manual review</div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <InfoCell label="AI Verdict"    value={r.verdict ?? "—"} />
                          <InfoCell label="Evidence File" value={r.filename ?? "—"} />
                          <InfoCell label="SHA-256 Hash"  value={r.pdf_hash.slice(0, 16) + "…"} />
                        </div>

                        <div className="mt-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Full SHA-256 Hash (Chain of Custody)</div>
                          <div className="font-mono text-[10px] text-zinc-500 break-all">{r.pdf_hash}</div>
                        </div>

                        {/* Manual Override Buttons */}
                        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                          <div className="text-xs font-semibold text-zinc-700 mb-3">
                            Manual Override Decision — compare AI report with raw evidence, then decide:
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <button type="button" onClick={() => openOverrideModal(r, "accept_override")}
                              className="flex-1 min-w-[200px] rounded-xl bg-purple-700 px-4 py-3 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-purple-700/25 transition-all text-left">
                              <div className="text-sm font-bold mb-0.5">✅ Accept Override</div>
                              <div className="text-purple-200 font-normal">Video IS authentic — forward to Clerk</div>
                            </button>
                            <button type="button" onClick={() => openOverrideModal(r, "reject_override")}
                              className="flex-1 min-w-[200px] rounded-xl bg-red-600 px-4 py-3 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-red-600/25 transition-all text-left">
                              <div className="text-sm font-bold mb-0.5">❌ Reject Override</div>
                              <div className="text-red-200 font-normal">AI is correct — send to Prosecutor as NOT ADMISSIBLE</div>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* EVIDENCE REGISTRY */}
              {active === "registry" && (
                loading ? <FEmpty text="Loading…" /> :
                reports.length === 0 ? <FEmpty text="No evidence items assigned yet." /> : (
                  <div className="overflow-x-auto rounded-2xl border border-zinc-200">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 text-zinc-500 uppercase text-xs tracking-wider border-b border-zinc-200">
                        <tr>
                          <th className="px-5 py-3 text-left">Case #</th>
                          <th className="px-5 py-3 text-left">AI Verdict</th>
                          <th className="px-5 py-3 text-left">Score</th>
                          <th className="px-5 py-3 text-left">Status</th>
                          <th className="px-5 py-3 text-left">File</th>
                          <th className="px-5 py-3 text-left">Added</th>
                          <th className="px-5 py-3 text-left">Video</th>
                          <th className="px-5 py-3 text-left">Report</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {reports.map(r => (
                          <tr key={r.id} className="hover:bg-zinc-50 transition-colors">
                            <td className="px-5 py-4 font-mono text-xs font-semibold text-[#1f6b2b]">{r.case_number}</td>
                            <td className="px-5 py-4">{verdictBadge(r.verdict)}</td>
                            <td className="px-5 py-4">{scoreBar(r.score)}</td>
                            <td className="px-5 py-4">{statusBadge(r.report_status)}</td>
                            <td className="px-5 py-4 text-xs text-zinc-500 max-w-[160px] truncate">{r.filename ?? "—"}</td>
                            <td className="px-5 py-4 text-xs text-zinc-400">{relativeTime(r.created_at)}</td>
                            <td className="px-5 py-4">
                              {r.has_video ? (
                                <a href={`${API_BASE}/reports/${r.id}/video`} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/25 transition-all">
                                  📹 Video
                                </a>
                              ) : <span className="text-zinc-300 text-xs">—</span>}
                            </td>
                            <td className="px-5 py-4">
                              <a href={`${API_BASE}/reports/${r.id}/pdf`} target="_blank" rel="noopener noreferrer"
                                className="rounded-full bg-[#1f6b2b] px-3 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 transition-all">
                                📄 PDF
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {/* REVIEW HISTORY */}
              {active === "history" && (
                loading ? <FEmpty text="Loading…" /> :
                reviewed.length === 0 ? <FEmpty text="No completed reviews yet." /> : (
                  <div className="space-y-4">
                    {reviewed.map(r => (
                      <div key={r.id} className={`rounded-2xl border p-4 ${r.report_status === "override_accepted" ? "border-purple-200 bg-purple-50/30" : "border-red-200 bg-red-50/30"}`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-bold text-[#1f6b2b]">Case #{r.case_number}</span>
                              {statusBadge(r.report_status)}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {r.filename ?? "—"} · Score: {r.score !== null ? `${Math.round(r.score * 100)}%` : "—"} · {relativeTime(r.created_at)}
                            </div>
                            {r.override_notes && (
                              <div className="mt-2 text-xs text-zinc-600 italic">📝 &ldquo;{r.override_notes}&rdquo;</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {verdictBadge(r.verdict)}
                            <a href={`${API_BASE}/reports/${r.id}/pdf`} target="_blank" rel="noopener noreferrer"
                              className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition-all">
                              📄 PDF
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
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

function FEmpty({ text, red }: { text: string; red?: boolean }) {
  return (
    <div className={`rounded-2xl border px-6 py-10 text-center text-sm ${red ? "border-red-200 bg-red-50 text-red-700" : "border-zinc-200 bg-zinc-50 text-zinc-500"}`}>
      {text}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">{label}</div>
      <div className="text-xs text-zinc-700 truncate">{value}</div>
    </div>
  );
}
