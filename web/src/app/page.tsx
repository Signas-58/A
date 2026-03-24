"use client";

import { useMemo, useState } from "react";

type AnalyzeResponse = {
  filename: string;
  content_type: string | null;
  verdict: string;
  score: number | null;
  signals: unknown[];
};

export default function Home() {
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
    <div className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto w-full max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          AI Video Detector
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Upload a video to analyze whether it may be edited/tampered/AI-generated.
        </p>

        <form onSubmit={onSubmit} className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <label className="block text-sm font-medium">
            Video file
            <input
              type="file"
              accept="video/*"
              className="mt-2 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-black"
              onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
            />
          </label>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
            >
              {isSubmitting ? "Analyzing…" : "Analyze"}
            </button>
            <div className="text-sm text-zinc-500 dark:text-zinc-400">
              Backend: <span className="font-mono">{apiBaseUrl}</span>
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
              {error}
            </div>
          ) : null}

          {result ? (
            <div className="mt-6">
              <h2 className="text-sm font-medium">Result</h2>
              <pre className="mt-2 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-black dark:text-zinc-100">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          ) : null}
        </form>
      </main>
    </div>
  );
}
