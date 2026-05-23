"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AnalyzeResponse = {
  filename: string;
  content_type: string | null;
  verdict: string;
  score: number | null;
  tamper_score?: number | null;
  deepfake_score?: number | null;
  combined_score?: number | null;
  signals: unknown[];
  metrics?: Record<string, unknown>;
  explanations?: { tamper?: string; deepfake?: string; verdict?: string };
  events?: Array<Record<string, unknown>>;
};

type Prosecutor = {
  id: number;
  username: string;
  email: string;
  organization: string | null;
};

type ForwardResult = {
  report_id: number;
  case_number: string;
  pdf_hash: string;
  verdict: string;
  message: string;
  routed_to?: string;       // "prosecutor" | "forensic_officer"
  report_status?: string;   // "forwarded_to_prosecutor" | "pending_forensic_review"
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : i === 1 ? 0 : 1;
  return `${v.toFixed(digits)} ${units[i]}`;
}

function scoreLabel(score: number | null): string {
  if (score == null || !Number.isFinite(score)) return "—";
  if (score < 0.35) return "Low";
  if (score < 0.7) return "Medium";
  return "High";
}

function verdictStyles(verdict: string): { badge: string; dot: string } {
  const v = verdict.toLowerCase();
  if (v.includes("high")) {
    return {
      badge: "border-red-200 bg-red-50 text-red-800",
      dot: "bg-red-500",
    };
  }
  if (v.includes("suspicious")) {
    return {
      badge: "border-amber-200 bg-amber-50 text-amber-900",
      dot: "bg-amber-500",
    };
  }
  if (v.includes("real")) {
    return {
      badge: "border-emerald-200 bg-emerald-50 text-emerald-900",
      dot: "bg-emerald-500",
    };
  }
  return {
    badge: "border-zinc-200 bg-zinc-50 text-zinc-800",
    dot: "bg-zinc-400",
  };
}

function ScoreCard({
  title,
  score,
}: {
  title: string;
  score: number | null | undefined;
}) {
  const s = score ?? null;
  const pct = s == null ? 0 : Math.max(0, Math.min(100, Math.round(s * 100)));
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-zinc-500">{title}</div>
        <div className="text-xs font-semibold text-zinc-700">{scoreLabel(s)}</div>
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <div className="text-2xl font-semibold tabular-nums">{s == null ? "—" : s.toFixed(3)}</div>
        <div className="text-xs text-zinc-500">{s == null ? "" : `${pct}%`}</div>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-[#0b3a1a]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function DetectorPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  // Forward-to-prosecutor state
  const [prosecutors, setProsecutors] = useState<Prosecutor[]>([]);
  const [selectedProsecutorId, setSelectedProsecutorId] = useState<number | null>(null);
  const [isForwarding, setIsForwarding] = useState(false);
  const [forwardError, setForwardError] = useState<string | null>(null);
  const [forwardResult, setForwardResult] = useState<ForwardResult | null>(null);

  const apiBaseUrl = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
    return raw.replace(/\/+$/, "");
  }, []);

  // Load prosecutors on mount
  useEffect(() => {
    fetch(`${apiBaseUrl}/users/prosecutors`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: unknown) => {
        const list = Array.isArray(data) ? (data as Prosecutor[]) : [];
        setProsecutors(list);
        if (list.length > 0) setSelectedProsecutorId(list[0].id);
      })
      .catch(() => {
        setProsecutors([]);
      });
  }, [apiBaseUrl]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setForwardResult(null);
    setForwardError(null);

    if (!file) {
      setError("Please choose a video file.");
      return;
    }

    const form = new FormData();
    form.append("file", file);

    setIsSubmitting(true);
    try {
      const resp = await fetch(`${apiBaseUrl}/analyze`, {
        method: "POST",
        body: form,
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`API error ${resp.status}: ${text}`);
      }

      const data = (await resp.json()) as AnalyzeResponse;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function downloadVerdict(r: AnalyzeResponse) {
    const payload = {
      filename: r.filename,
      verdict: r.verdict,
      score: r.combined_score ?? r.score,
      tamper_score: r.tamper_score ?? null,
      deepfake_score: r.deepfake_score ?? null,
      signals: r.signals,
      explanations: r.explanations ?? null,
      events: r.events ?? [],
    };

    const resp = await fetch(`${apiBaseUrl}/reports/verdict.pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`PDF export failed (${resp.status}): ${text}`);
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `juriscan-verdict-${(r.filename || "video").replace(/[^a-z0-9._-]+/gi, "_")}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onDownloadVerdict() {
    if (!result) return;
    setError(null);
    try {
      await downloadVerdict(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to download verdict PDF");
    }
  }

  async function onForwardToProsecutor() {
    if (!result || !selectedProsecutorId) return;
    setForwardError(null);
    setForwardResult(null);
    setIsForwarding(true);

    try {
      let investigatorId: number | null = null;
      try {
        const raw = localStorage.getItem("user");
        if (raw) {
          const u = JSON.parse(raw) as { id?: number };
          investigatorId = u.id ?? null;
        }
      } catch { /* ignore */ }

      const payload = {
        investigator_id: investigatorId ?? 0,
        prosecutor_id: selectedProsecutorId,
        filename: result.filename,
        verdict: result.verdict,
        score: result.combined_score ?? result.score,
        tamper_score: result.tamper_score ?? null,
        deepfake_score: result.deepfake_score ?? null,
        signals: result.signals,
        explanations: result.explanations ?? null,
        events: result.events ?? [],
      };

      const resp = await fetch(`${apiBaseUrl}/reports/forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Forward failed (${resp.status}): ${text}`);
      }

      const data = (await resp.json()) as ForwardResult;
      setForwardResult(data);
    } catch (e) {
      setForwardError(e instanceof Error ? e.message : "Failed to forward report");
    } finally {
      setIsForwarding(false);
    }
  }

  return (
    <div className="min-h-screen w-screen bg-gradient-to-b from-white to-zinc-50 p-6 text-zinc-950">
      <main className="mx-auto w-full max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-[#0b3a1a]">Investigator Portal</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 active:translate-y-0"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="rounded-xl bg-[#0b3a1a] px-4 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#0b3a1a]/20 active:translate-y-0"
            >
              Log in
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-[#caa54a] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold tracking-widest text-[#0b3a1a]">JURISCAN</div>
            <h1 className="text-3xl font-semibold tracking-tight text-[#0b3a1a]">AI Digital Evidence Verification</h1>
            <p className="max-w-3xl text-sm leading-6 text-zinc-700">
              Upload a video and we'll compute signals that can correlate with heavy editing, recompression, tampering, or deepfake synthesis.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          <section className="lg:col-span-2">
            <form
              onSubmit={onSubmit}
              className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-[#0b3a1a]">Upload</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Backend: <span className="font-mono">{apiBaseUrl}</span>
                  </p>
                </div>
                <span className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-600">
                  {isSubmitting ? "Working…" : "Ready"}
                </span>
              </div>

              <label className="mt-5 block text-sm font-medium">
                Video file
                <div className="mt-2 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-4">
                  <input
                    type="file"
                    accept="video/*"
                    className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-[#0b3a1a] file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:opacity-90"
                    onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
                  />
                  <div className="mt-3 text-xs text-zinc-600">
                    {file ? (
                      <div className="grid grid-cols-1 gap-1">
                        <div className="truncate">
                          <span className="text-zinc-700">Name:</span> {file.name}
                        </div>
                        <div>
                          <span className="text-zinc-700">Size:</span> {formatBytes(file.size)}
                        </div>
                        <div className="truncate">
                          <span className="text-zinc-700">Type:</span> {file.type || "—"}
                        </div>
                      </div>
                    ) : (
                      <div>Choose a file to enable analysis.</div>
                    )}
                  </div>
                </div>
              </label>

              <div className="mt-5 flex flex-col gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#0b3a1a] px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
                >
                  {isSubmitting ? "Analyzing…" : "Analyze video"}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting && !result}
                  onClick={() => {
                    setError(null);
                    setResult(null);
                    setForwardResult(null);
                    setForwardError(null);
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 disabled:opacity-60"
                >
                  Clear result
                </button>
              </div>

              {error ? (
                <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                Tip: start the backend first, then refresh this page.
              </div>
            </form>
          </section>

          <section className="lg:col-span-3 space-y-6">
            <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-[#0b3a1a]">Analysis</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Verdict, score, and signals derived from sampled frames.
                  </p>
                </div>
              </div>

              {!result ? (
                <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600">
                  No result yet. Upload a video and click "Analyze video".
                </div>
              ) : (
                <div className="mt-6 space-y-6">
                  {(() => {
                    const styles = verdictStyles(result.verdict);
                    return (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                          <div className="text-xs font-medium text-zinc-500">Verdict</div>
                          <div className="mt-2 flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${styles.badge}`}
                            >
                              {result.verdict}
                            </span>
                          </div>
                          <div className="mt-3 text-xs text-zinc-500">
                            File: <span className="font-mono">{result.filename}</span>
                          </div>
                          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => void onDownloadVerdict()}
                              className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#0b3a1a] px-4 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#0b3a1a]/20 active:translate-y-0"
                            >
                              Download verdict
                            </button>
                          </div>
                        </div>

                        <ScoreCard
                          title="Combined"
                          score={result.combined_score ?? result.score}
                        />
                      </div>
                    );
                  })()}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <ScoreCard title="Tamper" score={result.tamper_score} />
                    <ScoreCard title="Deepfake" score={result.deepfake_score} />
                  </div>

                  <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="text-xs font-medium text-zinc-500">Signals</div>
                    <div className="mt-2 text-sm">
                      {Array.isArray(result.signals) && result.signals.length > 0 ? (
                        <ul className="space-y-2">
                          {result.signals.slice(0, 10).map((s, i) => (
                            <li
                              key={i}
                              className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700"
                            >
                              <pre className="whitespace-pre-wrap break-words">
                                {JSON.stringify(s, null, 2)}
                              </pre>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-sm text-zinc-600">No signals reported.</div>
                      )}
                    </div>
                    {Array.isArray(result.signals) && result.signals.length > 10 ? (
                      <div className="mt-3 text-xs text-zinc-500">
                        Showing first 10 signals.
                      </div>
                    ) : null}
                  </div>

                  {result.explanations ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                      <div className="text-xs font-medium text-zinc-500">Why this verdict</div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-semibold text-[#0b3a1a]">Verdict</div>
                          <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-700">{result.explanations.verdict || "—"}</pre>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-semibold text-[#0b3a1a]">Tamper</div>
                          <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-700">{result.explanations.tamper || "—"}</pre>
                        </div>
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-semibold text-[#0b3a1a]">Deepfake</div>
                          <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-700">{result.explanations.deepfake || "—"}</pre>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {Array.isArray(result.events) && result.events.length > 0 ? (
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                      <div className="text-xs font-medium text-zinc-500">Timestamps (suspicious moments)</div>
                      <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-zinc-50 text-zinc-600">
                            <tr>
                              <th className="px-3 py-2 font-semibold">Type</th>
                              <th className="px-3 py-2 font-semibold">Time (s)</th>
                              <th className="px-3 py-2 font-semibold">Frame</th>
                              <th className="px-3 py-2 font-semibold">Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-200 bg-white">
                            {result.events.slice(0, 20).map((ev, i) => (
                              <tr key={i}>
                                <td className="px-3 py-2 text-zinc-700">{String(ev.type ?? "—")}</td>
                                <td className="px-3 py-2 text-zinc-700 tabular-nums">
                                  {typeof ev.time_s === "number" ? ev.time_s.toFixed(2) : "—"}
                                </td>
                                <td className="px-3 py-2 text-zinc-700 tabular-nums">{typeof ev.frame === "number" ? ev.frame : "—"}</td>
                                <td className="px-3 py-2 text-zinc-700">
                                  {ev.type === "abrupt_change" && typeof ev.mad === "number" ? `MAD=${ev.mad.toFixed(1)}` : null}
                                  {ev.type === "deepfake_frame" && typeof ev.prob === "number" ? `prob=${ev.prob.toFixed(3)}` : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {result.events.length > 20 ? (
                        <div className="mt-2 text-xs text-zinc-500">Showing first 20 events.</div>
                      ) : null}
                    </div>
                  ) : null}

                  <details className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <summary className="cursor-pointer text-sm font-medium">Raw JSON</summary>
                    <pre className="mt-3 overflow-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-900">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>

            {/* ── Forward to Prosecutor Panel ── */}
            {result && (
              <div className="rounded-3xl border border-[#caa54a] bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-5">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#0b3a1a]/10 text-lg">📨</div>
                  <div>
                    <h2 className="text-sm font-semibold text-[#0b3a1a]">Submit Verdict to System</h2>
                    <p className="text-xs text-zinc-500 mt-0.5">Routed automatically based on AI confidence score</p>
                  </div>
                </div>

                {/* Triage preview — shows BEFORE submitting */}
                {!forwardResult && result && (
                  <div className={`mb-4 rounded-2xl border px-4 py-3 text-xs ${
                    (result.combined_score ?? result.score ?? 0) >= 0.30
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-emerald-200 bg-emerald-50 text-emerald-900"
                  }`}>
                    <div className="font-bold mb-0.5">
                      {(result.combined_score ?? result.score ?? 0) >= 0.30
                        ? "🔬 Score ≥ 30% — Will route to Forensic Officer for manual review"
                        : "✅ Score < 30% — Will route directly to Prosecutor"}
                    </div>
                    <div className="opacity-70">
                      Combined score: <strong>{(((result.combined_score ?? result.score ?? 0)) * 100).toFixed(1)}%</strong> · Threshold: 30%
                    </div>
                  </div>
                )}

                {prosecutors.length === 0 ? (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-xs text-zinc-500">
                    No active prosecutors found. Ask an admin to activate a prosecutor account.
                  </div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <label className="block text-xs font-semibold text-zinc-700">
                        Select Prosecutor
                      </label>
                      <select
                        value={selectedProsecutorId ?? ""}
                        onChange={(e) => setSelectedProsecutorId(Number(e.target.value))}
                        className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition-all duration-200 focus:border-[#0b3a1a]/60 focus:ring-2 focus:ring-[#0b3a1a]/20"
                      >
                        {prosecutors.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.username}
                            {p.organization ? ` — ${p.organization}` : ""}
                            {" "}({p.email})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-4 rounded-2xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-xs text-zinc-600 space-y-1">
                      <div><span className="font-semibold text-zinc-700">File:</span> {result.filename}</div>
                      <div>
                        <span className="font-semibold text-zinc-700">Verdict:</span>{" "}
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-semibold ${verdictStyles(result.verdict).badge}`}>
                          {result.verdict}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isForwarding || forwardResult !== null}
                      onClick={() => void onForwardToProsecutor()}
                      className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#0b3a1a] px-4 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#0b3a1a]/25 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isForwarding ? (
                        <>
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                          Submitting…
                        </>
                      ) : forwardResult ? (
                        "✓ Submitted"
                      ) : (
                        "Submit Verdict →"
                      )}
                    </button>
                  </>
                )}

                {forwardError && (
                  <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                    {forwardError}
                  </div>
                )}

                {forwardResult && (
                  <div className={`mt-4 rounded-2xl border px-4 py-4 space-y-3 ${
                    forwardResult.routed_to === "forensic_officer"
                      ? "border-amber-200 bg-amber-50"
                      : "border-emerald-200 bg-emerald-50"
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {forwardResult.routed_to === "forensic_officer" ? "🔬" : "✓"}
                      </span>
                      <span className={`text-sm font-semibold ${
                        forwardResult.routed_to === "forensic_officer" ? "text-amber-800" : "text-emerald-800"
                      }`}>
                        {forwardResult.routed_to === "forensic_officer"
                          ? "Routed to Forensic Officer for manual review"
                          : "Report forwarded to Prosecutor"}
                      </span>
                    </div>
                    <div className="grid gap-2 text-xs">
                      <div className={`flex items-center justify-between rounded-xl border px-3 py-2 bg-white ${
                        forwardResult.routed_to === "forensic_officer" ? "border-amber-100" : "border-emerald-100"
                      }`}>
                        <span className="font-semibold text-zinc-600">Case ID</span>
                        <span className="font-mono font-semibold text-[#0b3a1a]">#{forwardResult.report_id}</span>
                      </div>
                      <div className={`flex items-center justify-between rounded-xl border px-3 py-2 bg-white ${
                        forwardResult.routed_to === "forensic_officer" ? "border-amber-100" : "border-emerald-100"
                      }`}>
                        <span className="font-semibold text-zinc-600">Case Number</span>
                        <span className="font-mono font-semibold text-[#0b3a1a]">{forwardResult.case_number}</span>
                      </div>
                      <div className={`flex items-center justify-between rounded-xl border px-3 py-2 bg-white ${
                        forwardResult.routed_to === "forensic_officer" ? "border-amber-100" : "border-emerald-100"
                      }`}>
                        <span className="font-semibold text-zinc-600">Routed to</span>
                        <span className={`font-semibold ${
                          forwardResult.routed_to === "forensic_officer" ? "text-amber-700" : "text-emerald-700"
                        }`}>
                          {forwardResult.routed_to === "forensic_officer" ? "🔬 Forensic Officer" : "⚖️ Prosecutor"}
                        </span>
                      </div>
                      <div className={`rounded-xl border px-3 py-2 bg-white ${
                        forwardResult.routed_to === "forensic_officer" ? "border-amber-100" : "border-emerald-100"
                      }`}>
                        <div className="font-semibold text-zinc-600 mb-1">SHA-256 Signature</div>
                        <div className="font-mono text-zinc-500 break-all leading-relaxed">{forwardResult.pdf_hash}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
