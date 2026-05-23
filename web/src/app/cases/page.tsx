"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

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
  case_number: string | null;
  verdict: string | null;
  filename: string | null;
  court_date: string;
  docket_pdf_hash: string;
  status: string;
  prosecutor_name: string | null;
  clerk_name: string | null;
  report_id: number;
  created_at: string;
};

type View = "reports" | "disclosures";

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

export default function CasesPage() {
  const router = useRouter();
  const [view, setView] = useState<View>("reports");
  const [role, setRole] = useState<string | null>(null);
  const [roleChecked, setRoleChecked] = useState(false);

  const [reports, setReports] = useState<Report[]>([]);
  const [disclosures, setDisclosures] = useState<Disclosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // role gate: only clerk and prosecutor
  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (!raw) { router.replace("/"); return; }
      const u = JSON.parse(raw);
      const r = (u.role ?? "").toLowerCase();
      if (r !== "clerk" && r !== "prosecutor") {
        router.replace("/");
        return;
      }
      setRole(r);
    } catch {
      router.replace("/");
      return;
    }
    setRoleChecked(true);
  }, [router]);

  useEffect(() => {
    if (!roleChecked) return;
    setLoading(true);
    setError(null);
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    Promise.all([
      fetch(`${API_BASE}/reports`, { headers }).then(r => r.ok ? r.json() : []),
      fetch(`${API_BASE}/disclosures`, { headers }).then(r => r.ok ? r.json() : []),
    ])
      .then(([rData, dData]) => {
        setReports(Array.isArray(rData) ? rData : []);
        setDisclosures(Array.isArray(dData) ? dData : []);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [roleChecked]);

  if (!roleChecked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white text-lg">
        Checking access…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900">
        <div className="mx-auto max-w-7xl px-8 py-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">
              <span className="text-[#f0b429]">Juriscan</span> — Evidence &amp; Case Registry
            </h1>
            <p className="mt-1 text-sm text-zinc-400">Restricted to Clerk &amp; Prosecutor roles · All records</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${role === "prosecutor" ? "border-[#1f6b2b] bg-[#1f6b2b]/20 text-emerald-400" : "border-blue-700 bg-blue-900/30 text-blue-400"}`}>
              {role}
            </span>
            <button type="button" onClick={() => router.back()}
              className="rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 transition-all">
              ← Back
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-8 py-8">
        {/* Tab toggle */}
        <div className="flex gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-1.5 w-fit mb-8">
          <button type="button" onClick={() => setView("reports")}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition-all ${view === "reports" ? "bg-[#1f6b2b] text-white shadow" : "text-zinc-400 hover:text-white"}`}>
            📄 AI Reports ({reports.length})
          </button>
          <button type="button" onClick={() => setView("disclosures")}
            className={`rounded-xl px-5 py-2 text-sm font-semibold transition-all ${view === "disclosures" ? "bg-[#1f6b2b] text-white shadow" : "text-zinc-400 hover:text-white"}`}>
            📩 Dockets ({disclosures.length})
          </button>
        </div>

        {loading && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-12 text-center text-zinc-500 text-sm">Loading…</div>
        )}
        {error && (
          <div className="rounded-2xl border border-red-800 bg-red-900/20 px-6 py-6 text-center text-red-400 text-sm">{error}</div>
        )}

        {/* Reports view */}
        {!loading && !error && view === "reports" && (
          reports.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-12 text-center text-zinc-500 text-sm">
              No AI reports yet. Forward a verdict from the Investigator panel first.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-zinc-400 uppercase text-xs tracking-wider border-b border-zinc-800">
                  <tr>
                    <th className="px-6 py-4 text-left">Case #</th>
                    <th className="px-6 py-4 text-left">File</th>
                    <th className="px-6 py-4 text-left">Verdict</th>
                    <th className="px-6 py-4 text-left">Date</th>
                    <th className="px-6 py-4 text-left">SHA-256 Hash</th>
                    <th className="px-6 py-4 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {reports.map(r => (
                    <tr key={r.id} className="bg-zinc-950 hover:bg-zinc-900 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs font-semibold text-[#f0b429]">{r.case_number}</td>
                      <td className="px-6 py-4 text-zinc-400 text-xs max-w-[160px] truncate">{r.filename ?? "—"}</td>
                      <td className="px-6 py-4">{verdictBadge(r.verdict)}</td>
                      <td className="px-6 py-4 text-zinc-500 text-xs whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-zinc-600 max-w-[140px] truncate">{r.pdf_hash}</td>
                      <td className="px-6 py-4">
                        <a href={`${API_BASE}/reports/${r.id}/pdf`} target="_blank" rel="noopener noreferrer"
                          className="inline-block rounded-full bg-[#1f6b2b] px-4 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 transition-all">
                          View PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Disclosures view */}
        {!loading && !error && view === "disclosures" && (
          disclosures.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-12 text-center text-zinc-500 text-sm">
              No disclosure dockets yet. Prosecutors can forward dockets from their dashboard.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-zinc-400 uppercase text-xs tracking-wider border-b border-zinc-800">
                  <tr>
                    <th className="px-6 py-4 text-left">Docket #</th>
                    <th className="px-6 py-4 text-left">Case #</th>
                    <th className="px-6 py-4 text-left">Verdict</th>
                    <th className="px-6 py-4 text-left">Prosecutor</th>
                    <th className="px-6 py-4 text-left">Clerk</th>
                    <th className="px-6 py-4 text-left">Court Date</th>
                    <th className="px-6 py-4 text-left">Status</th>
                    <th className="px-6 py-4 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {disclosures.map(d => (
                    <tr key={d.id} className="bg-zinc-950 hover:bg-zinc-900 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs font-semibold text-[#f0b429]">{d.docket_number}</td>
                      <td className="px-6 py-4 font-mono text-xs text-zinc-400">{d.case_number ?? "—"}</td>
                      <td className="px-6 py-4">{verdictBadge(d.verdict)}</td>
                      <td className="px-6 py-4 text-xs text-zinc-400">{d.prosecutor_name ?? "—"}</td>
                      <td className="px-6 py-4 text-xs text-zinc-400">{d.clerk_name ?? "—"}</td>
                      <td className="px-6 py-4 text-xs text-zinc-400 whitespace-nowrap">{d.court_date}</td>
                      <td className="px-6 py-4">{statusBadge(d.status)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <a href={`${API_BASE}/disclosures/${d.id}/pdf`} target="_blank" rel="noopener noreferrer"
                            className="rounded-full bg-[#1f6b2b] px-3 py-1.5 text-xs font-semibold text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 transition-all">
                            📋 Docket
                          </a>
                          <a href={`${API_BASE}/reports/${d.report_id}/pdf`} target="_blank" rel="noopener noreferrer"
                            className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 transition-all">
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
      </div>
    </div>
  );
}
