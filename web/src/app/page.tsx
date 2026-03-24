"use client";

import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100 px-6 py-12 text-zinc-950 dark:from-black dark:to-zinc-950 dark:text-zinc-50">
      <main className="mx-auto flex min-h-[70vh] w-full max-w-3xl items-center justify-center">
        <button
          type="button"
          onClick={() => router.push("/detector")}
          className="w-full max-w-xl rounded-3xl bg-zinc-950 px-8 py-16 text-center text-3xl font-semibold tracking-tight text-white shadow-lg transition hover:opacity-95 focus:outline-none focus:ring-4 focus:ring-zinc-300 disabled:opacity-60 dark:bg-white dark:text-black dark:focus:ring-zinc-700"
        >
          ngatipindei hedu
        </button>
      </main>
    </div>
  );
}
