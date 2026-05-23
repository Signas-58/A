"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";
const POLL_MS = 10_000;

type ProsecutorTab = "cases" | "library" | "reports" | "disclosure" | "preparation";

type Report = {
  id: number;
  case_number: string;
  investigator_id: number;
  prosecutor_id: number;
  pdf_hash: string;
  verdict: string | null;
  filename: string | null;
  created_at: string;
};

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
  status: string;
  clerk_name: string | null;
  created_at: string;
};

type Clerk = { id: number; username: string; email: string };
type User = { id: number; username: string; email: string; role: string };

// ─── helpers ────────────────────────────────────────────────────────────────

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

const EMPTY = "No records found. They will appear here automatically.";

// ─── component ──────────────────────────────────────────────────────────────

export default function ProsecutorPage() {
  const router = useRouter();
  const [active, setActive] = useState<ProsecutorTab>("cases");
  const [user, setUser] = useState<User | null>(null);

  // reports
  const [reports, setReports] = useState<Report[]>([]);
  const [rLoading, setRLoading] = useState(true);
  const [rError, setRError] = useState<string | null>(null);

  // disclosures
  const [disclosures, setDisclosures] = useState<Disclosure[]>([]);
  const [dLoading, setDLoading] = useState(true);

  // auto-refresh state
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsAgo, setSecondsAgo] = useState(0);

  // clerks (for modal)
  const [clerks, setClerks] = useState<Clerk[]>([]);

  // disclosure modal
  const [modalReport, setModalReport] = useState<Report | null>(null);
  const [assessment, setAssessment] = useState("");
  const [selectedClerkId, setSelectedClerkId] = useState<number | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ docket_number: string; court_date: string; docket_pdf_hash: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── load user ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) setUser(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // ── fetch clerks once ──
  useEffect(() => {
    fetch(`${API_BASE}/users/clerks`)
      .then(r => r.ok ? r.json() : [])
      .then((data: unknown) => setClerks(Array.isArray(data) ? (data as Clerk[]) : []))
      .catch(() => setClerks([]));
  }, []);

  // ── fetch reports ──
  const fetchReports = useCallback((spinner = false) => {
    if (spinner) setRLoading(true);
    setRError(null);
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const uid = user?.id;
    const url = uid ? `${API_BASE}/reports?prosecutor_id=${uid}` : `${API_BASE}/reports`;
    fetch(url, { headers })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: unknown) => {
        setReports(Array.isArray(data) ? (data as Report[]) : []);
        setRLoading(false);
        setLastUpdated(new Date());
        setSecondsAgo(0);
      })
      .catch(e => { setRError(e.message); setRLoading(false); });
  }, [user]);

  // ── fetch disclosures ──
  const fetchDisclosures = useCallback(() => {
    const uid = user?.id;
    const url = uid ? `${API_BASE}/disclosures?prosecutor_id=${uid}` : `${API_BASE}/disclosures`;
    fetch(url)
      .then(r => r.ok ? r.json() : [])
      .then((data: unknown) => { setDisclosures(Array.isArray(data) ? (data as Disclosure[]) : []); setDLoading(false); })
      .catch(() => setDLoading(false));
  }, [user]);

  useEffect(() => { fetchReports(true); fetchDisclosures(); }, [fetchReports, fetchDisclosures]);

  // auto-refresh
  useEffect(() => {
    timerRef.current = setInterval(() => { fetchReports(false); fetchDisclosures(); }, POLL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchReports, fetchDisclosures]);

  useEffect(() => {
    tickRef.current = setInterval(() => setSecondsAgo(s => s + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  // ── disclosure submit ──
  async function submitDisclosure() {
    if (!modalReport || !selectedClerkId || !assessment.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE}/disclosures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: modalReport.id,
          prosecutor_id: user?.id,
          clerk_id: selectedClerkId,
          assessment: assessment.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? `HTTP ${res.status}`);
      setSubmitResult({ docket_number: data.docket_number, court_date: data.court_date, docket_pdf_hash: data.docket_pdf_hash });
      fetchDisclosures();
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  function openModal(r: Report) {
    setModalReport(r);
    setAssessment("");
    setSelectedClerkId(clerks[0]?.id ?? "");
    setSubmitResult(null);
    setSubmitError(null);
  }

  function closeModal() {
    setModalReport(null);
    setSubmitResult(null);
  }

  const navItems = [
    { key: "cases" as ProsecutorTab, label: "My Cases", icon: "📄" },
    { key: "library" as ProsecutorTab, label: "Evidence Library", icon: "🔎" },
    { key: "reports" as ProsecutorTab, label: "AI Verification Reports", icon: "🤖" },
    { key: "disclosure" as ProsecutorTab, label: "Disclosure Requests", icon: "📩" },
    { key: "preparation" as ProsecutorTab, label: "Court Preparation", icon: "⚖️" },
  ];

  const stats = useMemo(() => [
    { label: "Active Cases", value: reports.length, icon: "📋" },
    { label: "Evidence Items", value: reports.length, icon: "📦" },
    { label: "AI-Verified Reports", value: reports.length, icon: "🤖" },
    { label: "Dockets Sent", value: disclosures.length, icon: "📩" },
  ], [reports, disclosures]);

  return (
    <div className="min-h-screen w-screen bg-zinc-50 text-zinc-950">
      {/* ── Disclosure modal ── */}
      {modalReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-xl rounded-3xl border border-zinc-200 bg-white p-8 shadow-2xl">
            {!submitResult ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-[#1f6b2b]">Request Court Disclosure</div>
                    <div className="mt-0.5 font-mono text-xs text-zinc-500">{modalReport.case_number}</div>
                  </div>
                  <button onClick={closeModal} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200">✕</button>
                </div>

                {/* Case summary */}
                <div className="mt-5 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 space-y-1 text-xs text-zinc-600">
                  <div className="flex justify-between"><span className="font-semibold">File</span><span className="truncate max-w-[240px]">{modalReport.filename ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="font-semibold">Verdict</span>{verdictBadge(modalReport.verdict)}</div>
                  <div className="flex justify-between"><span className="font-semibold">AI Hash</span><span className="font-mono truncate max-w-[200px]">{modalReport.pdf_hash.slice(0, 16)}…</span></div>
                </div>

                {/* Assessment */}
                <div className="mt-5 space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700">Legal Assessment <span className="text-red-500">*</span></label>
                  <textarea
                    value={assessment}
                    onChange={e => setAssessment(e.target.value)}
                    rows={5}
                    placeholder="Enter your legal assessment of the AI evidence for court disclosure…"
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-[#1f6b2b] focus:ring-2 focus:ring-[#1f6b2b]/15 resize-none"
                  />
                </div>

                {/* Court date info box */}
                <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2.5 text-xs text-blue-700">
                  🗓 Court date is auto-scheduled — 2 days ahead, 2 hours after the last docket
                </div>

                {/* Clerk selector */}
                <div className="mt-4 space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-700">Assign Clerk <span className="text-red-500">*</span></label>
                  {clerks.length === 0 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                      No active clerks found. Ask an admin to create a clerk account.
                    </div>
                  ) : (
                    <select
                      value={selectedClerkId}
                      onChange={e => setSelectedClerkId(Number(e.target.value))}
                      className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus:border-[#1f6b2b]"
                    >
                      {clerks.map(c => (
                        <option key={c.id} value={c.id}>{c.username} ({c.email})</option>
                      ))}
                    </select>
                  )}
                </div>

                {submitError && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">{submitError}</div>
                )}

                <div className="mt-6 flex gap-3">
                  <button onClick={closeModal} className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">
                    Cancel
                  </button>
                  <button
                    onClick={submitDisclosure}
                    disabled={submitting || !assessment.trim() || !selectedClerkId || clerks.length === 0}
                    className="flex-1 rounded-xl bg-[#1f6b2b] py-2.5 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 disabled:opacity-50 disabled:translate-y-0 disabled:cursor-not-allowed"
                  >
                    {submitting ? "Forwarding…" : "Forward Docket to Clerk →"}
                  </button>
                </div>
              </>
            ) : (
              /* Success state */
              <div className="text-center py-4">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl">✅</div>
                <div className="mt-4 text-lg font-semibold text-[#1f6b2b]">Docket Forwarded!</div>
                <div className="mt-1 text-sm text-zinc-500">The clerk has been notified.</div>

                <div className="mt-5 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 space-y-2 text-xs text-left text-zinc-700">
                  <div className="flex justify-between"><span className="font-semibold">Docket Number</span><span className="font-mono font-bold text-[#1f6b2b]">{submitResult.docket_number}</span></div>
                  <div className="flex justify-between"><span className="font-semibold">Court Date</span><span>{submitResult.court_date}</span></div>
                  <div className="flex justify-between items-start gap-2"><span className="font-semibold shrink-0">Docket Hash</span><span className="font-mono text-[10px] text-zinc-400 break-all">{submitResult.docket_pdf_hash}</span></div>
                </div>

                <button onClick={closeModal} className="mt-6 w-full rounded-xl bg-[#1f6b2b] py-2.5 text-sm font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 transition-all">
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
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-2xl">⚖️</div>
            <div className="mt-5 text-lg font-semibold">Prosecutor Portal</div>
            <div className="text-xs text-white/80">Case Management &amp; Evidence</div>
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
                  <span className="mr-2 inline-block w-5 text-center">{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
            <div className="mt-6 border-t border-white/15 pt-4">
              <button type="button" onClick={() => { localStorage.removeItem("token"); localStorage.removeItem("user"); router.push("/"); }}
                className="w-full rounded-xl bg-white/10 px-4 py-3 text-left text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/15">
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
              <h1 className="text-2xl font-semibold text-[#1f6b2b]">Prosecutor Dashboard</h1>
              <p className="mt-1 text-sm text-zinc-600">Build and present legal cases with AI-verified evidence</p>
            </div>
            <div className="flex items-center gap-3 rounded-3xl border border-zinc-200 bg-white px-6 py-4 shadow-sm">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[#1f6b2b] text-white">⚖️</div>
              <div>
                <div className="text-sm font-semibold">{user?.username ?? "Account"}</div>
                <div className="text-xs text-zinc-500">Prosecutor | Active</div>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-900">
            <div className="font-semibold">PROSECUTOR MODE ACTIVE — Evidence disclosed is tracked for chain of custody</div>
            <div className="mt-1 text-amber-700">AI-verified evidence is marked with a verification badge</div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map(s => (
              <div key={s.label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-3xl font-semibold text-[#1f6b2b] tabular-nums">{rLoading ? "…" : s.value}</div>
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
                  {active === "cases" ? "📋" : active === "library" ? "📚" : active === "reports" ? "🤖" : active === "disclosure" ? "📩" : "⚖️"}
                </div>
                <h2 className="text-base font-semibold text-[#1f6b2b]">
                  {active === "cases" ? "Active Criminal Cases" : active === "library" ? "Evidence Library" : active === "reports" ? "AI Verification Reports" : active === "disclosure" ? "Disclosure Requests" : "Court Preparation"}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                {lastUpdated && <span className="text-xs text-zinc-400">Updated {secondsAgo}s ago · auto-refreshes</span>}
                <button type="button" onClick={() => { fetchReports(true); fetchDisclosures(); }}
                  className="rounded-full bg-[#1f6b2b] px-4 py-2 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 transition-all">
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-5">
              {/* MY CASES */}
              {active === "cases" && (
                rLoading ? <LoadingBox /> : rError ? <ErrorBox msg={rError} /> : reports.length === 0 ? <EmptyBox msg={EMPTY} /> : (
                  <div className="overflow-x-auto rounded-2xl border border-zinc-200">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 text-zinc-500 uppercase text-xs tracking-wider border-b border-zinc-200">
                        <tr>
                          <th className="px-5 py-3 text-left">Case #</th>
                          <th className="px-5 py-3 text-left">File</th>
                          <th className="px-5 py-3 text-left">Verdict</th>
                          <th className="px-5 py-3 text-left">Date Filed</th>
                          <th className="px-5 py-3 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {reports.map(r => (
                          <tr key={r.id} className="hover:bg-zinc-50 transition-colors">
                            <td className="px-5 py-4 font-semibold text-[#1f6b2b] font-mono">{r.case_number}</td>
                            <td className="px-5 py-4 text-zinc-500 text-xs max-w-[160px] truncate">{r.filename ?? "—"}</td>
                            <td className="px-5 py-4">{verdictBadge(r.verdict)}</td>
                            <td className="px-5 py-4 text-zinc-400 text-xs">
                              <div>{new Date(r.created_at).toLocaleDateString()}</div>
                              <div>{relativeTime(r.created_at)}</div>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <a href={`${API_BASE}/reports/${r.id}/pdf`} target="_blank" rel="noopener noreferrer"
                                  className="inline-block rounded-full bg-zinc-700 px-3 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 transition-all">
                                  View PDF
                                </a>
                                <button type="button" onClick={() => openModal(r)}
                                  className="inline-flex items-center gap-1 rounded-full bg-[#1f6b2b] px-3 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 transition-all">
                                  📩 Request Disclosure
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}

              {/* EVIDENCE LIBRARY */}
              {active === "library" && (
                rLoading ? <LoadingBox /> : rError ? <ErrorBox msg={rError} /> : reports.length === 0 ? <EmptyBox msg={EMPTY} /> : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {reports.map(r => (
                      <div key={r.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:-translate-y-0.5 hover:shadow-md hover:border-[#1f6b2b]/30 transition-all">
                        <div className="flex items-start justify-between gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#1f6b2b]/10 text-lg">🎬</div>
                          <div className="flex-1 min-w-0">
                            <div className="font-mono text-xs font-semibold text-[#1f6b2b] truncate">{r.case_number}</div>
                            <div className="mt-0.5 text-xs text-zinc-500 truncate">{r.filename ?? "(unknown)"}</div>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between">{verdictBadge(r.verdict)}<span className="text-xs text-zinc-400">{relativeTime(r.created_at)}</span></div>
                        <div className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
                          <div className="text-xs text-zinc-500 mb-0.5 font-semibold">SHA-256 Signature</div>
                          <div className="font-mono text-[10px] text-zinc-400 truncate">{r.pdf_hash}</div>
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                          <span className="text-xs text-zinc-400">Inv. #{r.investigator_id}</span>
                          <a href={`${API_BASE}/reports/${r.id}/pdf`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#1f6b2b] px-3 py-1 text-xs font-semibold text-[#1f6b2b] hover:bg-[#1f6b2b] hover:text-white transition-all">
                            📄 PDF
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* AI VERIFICATION REPORTS */}
              {active === "reports" && (
                rLoading ? <LoadingBox /> : rError ? <ErrorBox msg={rError} /> : reports.length === 0 ? <EmptyBox msg={EMPTY} /> : (
                  <div className="space-y-4">
                    {reports.map(r => (
                      <div key={r.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-[#1f6b2b]/25 transition-all">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#1f6b2b]/10">🤖</div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-semibold text-[#1f6b2b]">{r.case_number}</span>
                                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">ID #{r.id}</span>
                              </div>
                              <div className="mt-0.5 text-xs text-zinc-500 truncate max-w-[260px]">{r.filename ?? "(unknown)"}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {verdictBadge(r.verdict)}
                            <a href={`${API_BASE}/reports/${r.id}/pdf`} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-full bg-[#1f6b2b] px-3 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 transition-all">
                              📄 Report PDF
                            </a>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <InfoCell label="Date Filed" value={new Date(r.created_at).toLocaleString()} sub={relativeTime(r.created_at)} />
                          <InfoCell label="Verification Status" value="✅ AI Verified" valueClass="text-emerald-700 font-semibold" />
                          <InfoCell label="Investigator" value={`#${r.investigator_id}`} />
                        </div>
                        <div className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">SHA-256 Hash</div>
                          <div className="font-mono text-[11px] text-zinc-500 break-all">{r.pdf_hash}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* DISCLOSURE REQUESTS */}
              {active === "disclosure" && (
                dLoading ? <LoadingBox /> : disclosures.length === 0 ? <EmptyBox msg="No disclosure requests yet. Click 'Request Disclosure' on a case to forward a docket to a clerk." /> : (
                  <div className="space-y-4">
                    {disclosures.map(d => (
                      <div key={d.id} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm hover:border-[#1f6b2b]/25 transition-all">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#1f6b2b]/10 text-lg">📩</div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-semibold text-[#1f6b2b]">{d.docket_number}</span>
                                {statusBadge(d.status)}
                              </div>
                              <div className="mt-0.5 text-xs text-zinc-500">Case: {d.case_number ?? "—"} · Clerk: {d.clerk_name ?? "—"}</div>
                            </div>
                          </div>
                          <a href={`${API_BASE}/disclosures/${d.id}/pdf`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-[#1f6b2b] px-3 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 transition-all">
                            📋 Docket PDF
                          </a>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <InfoCell label="Court Date" value={d.court_date} />
                          <InfoCell label="Verdict" value={d.verdict ?? "—"} />
                          <InfoCell label="Filed" value={relativeTime(d.created_at)} />
                        </div>
                        <div className="mt-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">Assessment</div>
                          <div className="text-xs text-zinc-600 line-clamp-2">{d.assessment}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {active === "preparation" && (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-500">Court Preparation — coming soon.</div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

// ─── small shared sub-components ───────────────────────────────────────────

function LoadingBox() {
  return <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-500">Loading…</div>;
}
function ErrorBox({ msg }: { msg: string }) {
  return <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-6 text-center text-sm text-red-700">{msg}</div>;
}
function EmptyBox({ msg }: { msg: string }) {
  return <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-500">{msg}</div>;
}
function InfoCell({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">{label}</div>
      <div className={`text-xs text-zinc-700 ${valueClass ?? ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-zinc-400 mt-0.5">{sub}</div>}
    </div>
  );
}
