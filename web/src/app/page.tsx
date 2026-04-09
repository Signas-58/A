"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push("/detector");
  };

  return (
    <div className="min-h-screen w-screen bg-white text-zinc-950">
      <header className="sticky top-0 z-50 bg-[#0b3a1a] text-white">
        <div className="w-full px-6">
          <div className="flex items-center justify-between py-2 text-xs">
            <div className="font-medium">08688007501/08688007447-8</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`rounded-md px-2 py-1 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/20 hover:shadow-lg hover:shadow-black/20 active:translate-y-0 ${
                  mode === "signin" ? "bg-white/20" : ""
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`rounded-md px-2 py-1 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/20 hover:shadow-lg hover:shadow-black/20 active:translate-y-0 ${
                  mode === "signup" ? "bg-white/20" : ""
                }`}
              >
                Sign up
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 py-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-sm font-semibold">JSC</div>
              <div className="text-sm font-semibold tracking-wide">JUDICIAL SERVICE COMMISSION</div>
            </div>

            <nav className="hidden items-center gap-6 text-sm md:flex">
              <a
                className="transition-all duration-200 hover:-translate-y-0.5 hover:text-[#f6d989] hover:underline hover:decoration-2 hover:underline-offset-4"
                href="#home"
              >
                Home
              </a>
              <a
                className="transition-all duration-200 hover:-translate-y-0.5 hover:text-[#f6d989] hover:underline hover:decoration-2 hover:underline-offset-4"
                href="#about"
              >
                About
              </a>
              <a
                className="transition-all duration-200 hover:-translate-y-0.5 hover:text-[#f6d989] hover:underline hover:decoration-2 hover:underline-offset-4"
                href="#courts"
              >
                The Courts
              </a>
              <a
                className="transition-all duration-200 hover:-translate-y-0.5 hover:text-[#f6d989] hover:underline hover:decoration-2 hover:underline-offset-4"
                href="#library"
              >
                Library
              </a>
              <a
                className="transition-all duration-200 hover:-translate-y-0.5 hover:text-[#f6d989] hover:underline hover:decoration-2 hover:underline-offset-4"
                href="#news"
              >
                News
              </a>
              <a
                className="transition-all duration-200 hover:-translate-y-0.5 hover:text-[#f6d989] hover:underline hover:decoration-2 hover:underline-offset-4"
                href="#careers"
              >
                Careers
              </a>
              <a
                className="transition-all duration-200 hover:-translate-y-0.5 hover:text-[#f6d989] hover:underline hover:decoration-2 hover:underline-offset-4"
                href="#contacts"
              >
                Contacts
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main id="home" className="w-full px-6">
        <section className="group relative left-1/2 right-1/2 -mx-[50vw] w-screen overflow-hidden border-y border-zinc-200 bg-white py-10 md:py-14 min-h-[280px] md:min-h-[340px]">
          <div className="absolute inset-0 transition-all duration-300 group-hover:scale-[1.02] group-hover:brightness-110">
            <Image src="/banner.webp" alt="Banner" fill priority className="object-cover opacity-100" />
            <div className="absolute inset-0 bg-white/25" />
          </div>

          <div className="relative mx-auto grid w-full items-center gap-10 px-6 md:grid-cols-2">
            <div className="space-y-5 md:pr-10">
              <div className="inline-flex items-center gap-3">
                <div className="grid h-14 w-14 place-items-center rounded-full border border-zinc-200 bg-white text-sm font-semibold text-[#0b3a1a]">
                  JSC
                </div>
                <div>
                  <div className="text-2xl font-semibold leading-tight text-[#0b3a1a]">JUDICIAL SERVICE</div>
                  <div className="text-2xl font-semibold leading-tight text-[#0b3a1a]">COMMISSION</div>
                </div>
              </div>

              <div className="text-center text-xl font-semibold text-[#0b3a1a]">JSC Zimbabwe</div>
              <div className="text-center text-sm italic text-zinc-700">"A Zimbabwe in which world class justice prevails!"</div>
            </div>

            <div className="hidden md:block" />
          </div>

          <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 px-6">
            <div className="pointer-events-auto scale-[1.30] rounded-2xl border border-zinc-200 bg-white/80 p-5 shadow-2xl backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">{mode === "signin" ? "Sign in" : "Sign up"}</h2>
                <div className="text-xs text-zinc-600">(placeholder)</div>
              </div>

              <form onSubmit={onSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="username" className="text-xs font-medium transition-colors hover:text-[#0b3a1a]">
                    Username
                  </label>
                  <input
                    id="username"
                    name="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition-all duration-200 hover:shadow-2xl hover:shadow-[#0b3a1a]/45 focus:border-[#0b3a1a]/80 focus:ring-4 focus:ring-[#0b3a1a]/45 focus:shadow-2xl focus:shadow-[#0b3a1a]/70"
                    placeholder="yourname"
                    autoComplete="username"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-xs font-medium transition-colors hover:text-[#0b3a1a]">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition-all duration-200 hover:shadow-2xl hover:shadow-[#0b3a1a]/45 focus:border-[#0b3a1a]/80 focus:ring-4 focus:ring-[#0b3a1a]/45 focus:shadow-2xl focus:shadow-[#0b3a1a]/70"
                    placeholder="••••••••"
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="h-10 w-full rounded-xl bg-[#0b3a1a] text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#0b3a1a]/30 focus:outline-none focus:ring-4 focus:ring-[#0b3a1a]/25 active:translate-y-0"
                >
                  {mode === "signin" ? "Continue" : "Create account"}
                </button>

                <div className="text-center text-xs text-zinc-600">
                  {mode === "signin" ? (
                    <button
                      type="button"
                      onClick={() => setMode("signup")}
                      className="underline underline-offset-4 transition-all duration-200 hover:-translate-y-0.5 hover:text-[#0b3a1a] hover:decoration-[#0b3a1a] hover:decoration-2"
                    >
                      Don&apos;t have an account? Sign up
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMode("signin")}
                      className="underline underline-offset-4 transition-all duration-200 hover:-translate-y-0.5 hover:text-[#0b3a1a] hover:decoration-[#0b3a1a] hover:decoration-2"
                    >
                      Already have an account? Sign in
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </section>

        <section id="about" className="border-t border-zinc-200 py-14">
          <div className="grid gap-10 md:grid-cols-2">
            <div className="group overflow-hidden rounded-3xl border border-[#caa54a] bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/20">
              <div className="relative h-[320px] bg-zinc-50">
                <Image
                  src="/Jschouse.webp"
                  alt="JSC House"
                  fill
                  className="object-cover transition-all duration-300 group-hover:scale-[1.04] group-hover:brightness-110"
                />
              </div>
            </div>

            <div className="group rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#0b3a1a]/40 hover:shadow-2xl hover:shadow-[#0b3a1a]/20">
              <h2 className="text-xl font-semibold text-[#0b3a1a] transition-all duration-300 hover:text-[#0b3a1a] hover:shadow-xl hover:shadow-[#0b3a1a]/40 hover:underline hover:decoration-[#caa54a] hover:decoration-4 hover:underline-offset-4">The Judicial Service Commission</h2>
              <p className="mt-4 text-sm leading-relaxed text-zinc-700">
                The Judicial Service Commission (JSC) of Zimbabwe is an independent constitutional body established under section 189 of the Constitution
                of Zimbabwe Amendment (No.20) Act 2013. The Commission has mandate to advise the government on matters related to the judiciary and the
                administration of Justice. The Commission is dedicated to ensuring the effective functioning of the judicial system, promoting the rule of law,
                and safeguarding the rights of all citizens........
              </p>
              <div className="mt-5">
                <button
                  type="button"
                  className="rounded-md border border-[#0b3a1a] px-4 py-2 text-xs font-semibold text-[#0b3a1a] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#0b3a1a]/10 hover:shadow-lg hover:shadow-[#0b3a1a]/15 active:translate-y-0"
                >
                  More About JSC &gt;&gt;&gt;
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="courts" className="border-t border-zinc-200 py-14">
          <div className="rounded-3xl border border-[#caa54a] bg-white p-8 shadow-sm">
            <div className="grid gap-6 md:grid-cols-3">
              <div className="group rounded-2xl border border-zinc-200 bg-white/70 p-5 text-center transition-all duration-300 hover:-translate-y-1 hover:border-[#0b3a1a]/40 hover:shadow-2xl hover:shadow-[#0b3a1a]/10">
                <div className="mx-auto mb-3 h-10 w-10 rounded-lg border border-[#0b3a1a]/20 bg-[#0b3a1a]/5" />
                <div className="text-lg font-semibold text-[#0b3a1a] transition-all duration-200 group-hover:scale-[1.03] group-hover:text-[#0b3a1a] group-hover:underline group-hover:decoration-[#caa54a] group-hover:decoration-4 group-hover:underline-offset-4">
                  Constitutional Court
                </div>
                <p className="mt-2 text-xs text-zinc-700">
                  The Constitutional Court is a superior court of record established in terms of section 166 of the Constitution of Zimbabwe, 2013.
                </p>
              </div>
              <div className="group rounded-2xl border border-zinc-200 bg-white/70 p-5 text-center transition-all duration-300 hover:-translate-y-1 hover:border-[#0b3a1a]/40 hover:shadow-2xl hover:shadow-[#0b3a1a]/10">
                <div className="mx-auto mb-3 h-10 w-10 rounded-lg border border-[#0b3a1a]/20 bg-[#0b3a1a]/5" />
                <div className="text-lg font-semibold text-[#0b3a1a] transition-all duration-200 group-hover:scale-[1.03] group-hover:text-[#0b3a1a] group-hover:underline group-hover:decoration-[#caa54a] group-hover:decoration-4 group-hover:underline-offset-4">
                  Supreme Court
                </div>
                <p className="mt-2 text-xs text-zinc-700">
                  The Supreme court is a superior court of record established in terms of section 168 of the Constitution of Zimbabwe, 2013.
                </p>
              </div>
              <div className="group rounded-2xl border border-zinc-200 bg-white/70 p-5 text-center transition-all duration-300 hover:-translate-y-1 hover:border-[#0b3a1a]/40 hover:shadow-2xl hover:shadow-[#0b3a1a]/10">
                <div className="mx-auto mb-3 h-10 w-10 rounded-lg border border-[#0b3a1a]/20 bg-[#0b3a1a]/5" />
                <div className="text-lg font-semibold text-[#0b3a1a] transition-all duration-200 group-hover:scale-[1.03] group-hover:text-[#0b3a1a] group-hover:underline group-hover:decoration-[#caa54a] group-hover:decoration-4 group-hover:underline-offset-4">
                  High Court
                </div>
                <p className="mt-2 text-xs text-zinc-700">
                  Its operations are in the main governed by the Constitution and the High Court Act [Chapter 7:06].
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                className="rounded-md border border-[#0b3a1a] px-4 py-2 text-xs font-semibold text-[#0b3a1a] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#0b3a1a]/10 hover:shadow-lg hover:shadow-[#0b3a1a]/15 active:translate-y-0"
              >
                More About Courts &gt;&gt;&gt;
              </button>
            </div>
          </div>
        </section>

        <section id="events" className="border-t border-zinc-200 py-14 text-center">
          <div className="text-xl font-semibold text-[#0b3a1a]">Events Calendar</div>
          <div className="mx-auto mt-3 h-0.5 w-16 bg-[#caa54a]" />
          <p className="mx-auto mt-6 max-w-xl text-sm text-zinc-700">For latest updates on upcoming events, visit this section regularly</p>
        </section>

        <section id="notices" className="border-t border-zinc-200 py-14">
          <div className="text-center">
            <div className="text-xl font-semibold text-[#0b3a1a]">Notices</div>
          </div>
        </section>
      </main>
    </div>
  );
}
