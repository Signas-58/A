"use client";

import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  return (
    <div className="h-screen w-screen bg-gradient-to-b from-zinc-50 to-zinc-100 p-6 text-zinc-950 dark:from-black dark:to-zinc-950 dark:text-zinc-50">
      <main className="flex h-full w-full items-center justify-center">
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
