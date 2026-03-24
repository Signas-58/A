"use client";

import { useMemo, useState } from "react";

type AnalyzeResponse = {
  filename: string;
  content_type: string | null;
  verdict: string;
  score: number | null;
  signals: unknown[];
  metrics?: Record<string, unknown>;
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
      badge:
        "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200",
      dot: "bg-red-500",
    };
  }
  if (v.includes("suspicious")) {
    return {
      badge:
        "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100",
      dot: "bg-amber-500",
    };
  }
  if (v.includes("real")) {
    return {
      badge:
        "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100",
      dot: "bg-emerald-500",
    };
  }
  return {
    badge:
      "border-zinc-200 bg-zinc-50 text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200",
    dot: "bg-zinc-400",
  };
}

export default function DetectorPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const apiBaseUrl = useMemo(() => {
    return "http://127.0.0.1:8000";
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 px-6 py-12 text-zinc-950 dark:from-black dark:to-zinc-950 dark:text-zinc-50">
      <main className="mx-auto w-full max-w-4xl">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">AI Video Detector</h1>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Upload a video and we’ll compute a set of CPU-friendly heuristics to highlight signals that can
            correlate with heavy editing, recompression, or tampering.
          </p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          <section className="lg:col-span-2">
            <form
              onSubmit={onSubmit}
              className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">Upload</h2>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Backend: <span className="font-mono">{apiBaseUrl}</span>
                  </p>
                </div>
                <span className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                  {isSubmitting ? "Working…" : "Ready"}
                </span>
              </div>

              <label className="mt-5 block text-sm font-medium">
                Video file
                <div className="mt-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-black">
                  <input
                    type="file"
                    accept="video/*"
                    className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-zinc-950 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:opacity-90 dark:file:bg-white dark:file:text-black"
                    onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
                  />
                  <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                    {file ? (
                      <div className="grid grid-cols-1 gap-1">
                        <div className="truncate">
                          <span className="text-zinc-700 dark:text-zinc-200">Name:</span> {file.name}
                        </div>
                        <div>
                          <span className="text-zinc-700 dark:text-zinc-200">Size:</span> {formatBytes(file.size)}
                        </div>
                        <div className="truncate">
                          <span className="text-zinc-700 dark:text-zinc-200">Type:</span> {file.type || "—"}
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
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white shadow-sm disabled:opacity-60 dark:bg-white dark:text-black"
                >
                  {isSubmitting ? "Analyzing…" : "Analyze video"}
                </button>
                <button
                  type="button"
                  disabled={isSubmitting && !result}
                  onClick={() => {
                    setError(null);
                    setResult(null);
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  Clear result
                </button>
              </div>

              {error ? (
                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                  {error}
                </div>
              ) : null}

              <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-black dark:text-zinc-300">
                Tip: start the backend first, then refresh this page.
              </div>
            </form>
          </section>

          <section className="lg:col-span-3">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">Analysis</h2>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Verdict, score, and signals derived from sampled frames.
                  </p>
                </div>
              </div>

              {!result ? (
                <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-black dark:text-zinc-300">
                  No result yet. Upload a video and click “Analyze video”.
                </div>
              ) : (
                <div className="mt-6 space-y-6">
                  {(() => {
                    const styles = verdictStyles(result.verdict);
                    const score = result.score;
                    const pct =
                      score == null ? 0 : Math.max(0, Math.min(100, Math.round(score * 100)));
                    return (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Verdict</div>
                          <div className="mt-2 flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${styles.badge}`}
                            >
                              {result.verdict}
                            </span>
                          </div>
                          <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                            File: <span className="font-mono">{result.filename}</span>
                          </div>
                        </div>

                        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                          <div className="flex items-center justify-between">
                            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                              Suspiciousness
                            </div>
                            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                              {scoreLabel(score)}
                            </div>
                          </div>
                          <div className="mt-2 flex items-baseline justify-between">
                            <div className="text-2xl font-semibold tabular-nums">
                              {score == null ? "—" : score.toFixed(3)}
                            </div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400">
                              {score == null ? "" : `${pct}%`}
                            </div>
                          </div>
                          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                            <div
                              className="h-full rounded-full bg-zinc-950 dark:bg-white"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Signals</div>
                    <div className="mt-2 text-sm">
                      {Array.isArray(result.signals) && result.signals.length > 0 ? (
                        <ul className="space-y-2">
                          {result.signals.slice(0, 10).map((s, i) => (
                            <li
                              key={i}
                              className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-black dark:text-zinc-200"
                            >
                              <pre className="whitespace-pre-wrap break-words">
                                {JSON.stringify(s, null, 2)}
                              </pre>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-sm text-zinc-600 dark:text-zinc-300">No signals reported.</div>
                      )}
                    </div>
                    {Array.isArray(result.signals) && result.signals.length > 10 ? (
                      <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                        Showing first 10 signals.
                      </div>
                    ) : null}
                  </div>

                  <details className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                    <summary className="cursor-pointer text-sm font-medium">Raw JSON</summary>
                    <pre className="mt-3 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-black dark:text-zinc-100">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
