"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="h-screen w-screen bg-gradient-to-b from-zinc-50 to-zinc-100 p-6 text-zinc-950 dark:from-black dark:to-zinc-950 dark:text-zinc-50">
      <main className="flex h-full w-full items-center justify-center">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white/70 p-6 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/50">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Enter any username and password to continue.</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              router.push("/detector");
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-medium">
                Username
              </label>
              <input
                id="username"
                name="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-400 focus:ring-4 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-black dark:focus:border-zinc-600 dark:focus:ring-zinc-800"
                placeholder="yourname"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-400 focus:ring-4 focus:ring-zinc-200 dark:border-zinc-800 dark:bg-black dark:focus:border-zinc-600 dark:focus:ring-zinc-800"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              className="h-11 w-full rounded-xl bg-zinc-950 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus:ring-4 focus:ring-zinc-300 disabled:opacity-60 dark:bg-white dark:text-black dark:focus:ring-zinc-700"
            >
              Continue
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
