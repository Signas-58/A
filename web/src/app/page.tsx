"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signinOpen, setSigninOpen] = useState(false);
  const [signinRole, setSigninRole] = useState<"admin" | "investigator" | "prosecutor" | "custodian" | "clerk">("investigator");
  const [signinError, setSigninError] = useState<string | null>(null);
  const [signinBusy, setSigninBusy] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupRole, setSignupRole] = useState<"investigator" | "prosecutor" | "custodian" | "clerk">("investigator");
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState<string | null>(null);
  const [signupBusy, setSignupBusy] = useState(false);

  const [signupFullName, setSignupFullName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupOrganization, setSignupOrganization] = useState("");
  const [signupJustification, setSignupJustification] = useState("");
  const [signupAgree, setSignupAgree] = useState(false);

  const onSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError(null);
    setSignupSuccess(null);

    if (signupPassword !== signupConfirmPassword) {
      setSignupError("Passwords do not match.");
      return;
    }

    setSignupBusy(true);
    try {
      const res = await fetch(`${API_BASE}/access-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: signupFullName.trim(),
          email: signupEmail.trim(),
          password: signupPassword,
          role: signupRole,
          organization: signupOrganization.trim() || null,
          justification: signupJustification.trim() || null,
        }),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        setSignupError((msg && (msg.detail as string)) || "Registration request failed.");
        return;
      }

      setSignupSuccess("Access request submitted. Await admin approval.");
      clearSignup();
    } catch {
      setSignupError("Could not reach backend. Ensure the API is running.");
    } finally {
      setSignupBusy(false);
    }
  };

  const clearSignup = () => {
    setSignupFullName("");
    setSignupEmail("");
    setSignupPassword("");
    setSignupConfirmPassword("");
    setSignupOrganization("");
    setSignupRole("investigator");
    setSignupJustification("");
    setSignupAgree(false);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigninError(null);
    setSigninBusy(true);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, role: signinRole }),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        setSigninError((msg && (msg.detail as string)) || "Login failed.");
        return;
      }

      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; user?: { role?: string } }
        | null;
      const actualRole = (data && data.user && data.user.role) || null;
      if (actualRole && signinRole && actualRole !== signinRole) {
        setSigninError("Incorrect role");
        return;
      }
      const roleFromServer = actualRole || signinRole;

      setSigninOpen(false);
      router.push(
        roleFromServer === "admin"
          ? "/admin"
          : roleFromServer === "prosecutor"
            ? "/prosecutor"
            : roleFromServer === "custodian"
              ? "/custodian"
              : roleFromServer === "clerk"
                ? "/clerk"
                : "/detector"
      );
    } catch {
      setSigninError("Could not reach backend. Ensure the API is running.");
    } finally {
      setSigninBusy(false);
    }
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
                onClick={() => {
                  setMode("signup");
                  setSignupError(null);
                  setSignupSuccess(null);
                  setSignupOpen(true);
                }}
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
              <div className="mb-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSignupOpen(false);
                    setSigninError(null);
                    setSigninOpen(true);
                    setMode("signin");
                  }}
                  className="h-10 rounded-xl bg-[#2f7a2f] text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-[#2f7a2f]/30 active:translate-y-0"
                >
                  Sign in
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setSignupError(null);
                    setSignupSuccess(null);
                    setSignupOpen(true);
                  }}
                  className="h-10 rounded-xl border border-[#2f7a2f] bg-white text-sm font-semibold text-[#2f7a2f] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#2f7a2f]/5 hover:shadow-xl hover:shadow-[#2f7a2f]/20 active:translate-y-0"
                >
                  Sign up
                </button>
              </div>

              <div className="flex flex-col items-center text-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#2f7a2f] text-2xl text-white shadow-lg shadow-black/10">
                  ⚖️
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-wide text-[#2f7a2f]">Juriscan</div>
                <div className="mt-1 text-xs text-zinc-600">AI Digital Evidence Verification</div>
              </div>
            </div>
          </div>
        </section>

        {signinOpen ? (
          <div
            className="fixed inset-0 z-[110] flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            onMouseDown={() => setSigninOpen(false)}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            <div
              className="relative mx-4 w-full max-w-md overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="px-10 pt-10 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#2f7a2f] text-3xl text-white shadow-lg shadow-black/10">
                  ⚖️
                </div>
                <div className="mt-4 text-3xl font-semibold tracking-wide text-[#2f7a2f]">Juriscan</div>
                <div className="mt-1 text-sm text-zinc-600">AI Digital Evidence Verification</div>
              </div>

              <form onSubmit={onSubmit} className="space-y-5 px-10 pb-10 pt-8">
                {signinError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {signinError}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label htmlFor="signinEmail" className="text-sm font-semibold">
                    Email Address
                  </label>
                  <input
                    id="signinEmail"
                    name="signinEmail"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    type="email"
                    className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition-all duration-200 hover:shadow-2xl hover:shadow-[#2f7a2f]/35 focus:border-[#2f7a2f]/80 focus:ring-4 focus:ring-[#2f7a2f]/30 focus:shadow-2xl focus:shadow-[#2f7a2f]/55"
                    placeholder="Enter your email"
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-semibold">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition-all duration-200 hover:shadow-2xl hover:shadow-[#2f7a2f]/35 focus:border-[#2f7a2f]/80 focus:ring-4 focus:ring-[#2f7a2f]/30 focus:shadow-2xl focus:shadow-[#2f7a2f]/55"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold">Role</label>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => setSigninRole("admin")}
                      className={`h-10 rounded-full border px-3 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 ${
                        signinRole === "admin" ? "border-[#2f7a2f] bg-[#2f7a2f]/10" : "border-zinc-200 bg-white"
                      }`}
                    >
                      Admin
                    </button>
                    <button
                      type="button"
                      onClick={() => setSigninRole("investigator")}
                      className={`h-10 rounded-full border px-3 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 ${
                        signinRole === "investigator" ? "border-[#2f7a2f] bg-[#2f7a2f]/10" : "border-zinc-200 bg-white"
                      }`}
                    >
                      Investigator
                    </button>
                    <button
                      type="button"
                      onClick={() => setSigninRole("prosecutor")}
                      className={`h-10 rounded-full border px-3 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 ${
                        signinRole === "prosecutor" ? "border-[#2f7a2f] bg-[#2f7a2f]/10" : "border-zinc-200 bg-white"
                      }`}
                    >
                      Prosecutor
                    </button>
                    <button
                      type="button"
                      onClick={() => setSigninRole("custodian")}
                      className={`h-10 rounded-full border px-3 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 ${
                        signinRole === "custodian" ? "border-[#2f7a2f] bg-[#2f7a2f]/10" : "border-zinc-200 bg-white"
                      }`}
                    >
                      Forensic Officer
                    </button>
                    <button
                      type="button"
                      onClick={() => setSigninRole("clerk")}
                      className={`h-10 rounded-full border px-3 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 ${
                        signinRole === "clerk" ? "border-[#2f7a2f] bg-[#2f7a2f]/10" : "border-zinc-200 bg-white"
                      }`}
                    >
                      Clerk
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={signinBusy}
                  className={`h-12 w-full rounded-2xl bg-[#2f7a2f] text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-[#2f7a2f]/35 active:translate-y-0 ${
                    signinBusy ? "cursor-not-allowed opacity-70" : ""
                  }`}
                >
                  {signinBusy ? "Signing in..." : "Login →"}
                </button>

                <div className="pt-1 text-center text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setSigninOpen(false);
                      setMode("signup");
                      setSignupError(null);
                      setSignupSuccess(null);
                      setSignupOpen(true);
                    }}
                    className="text-[#2f7a2f] underline underline-offset-4 transition-all duration-200 hover:-translate-y-0.5 hover:text-[#0b3a1a]"
                  >
                    Don&apos;t have an account? Request Access
                  </button>
                </div>
              </form>

              <button
                type="button"
                onClick={() => setSigninOpen(false)}
                className="absolute right-3 top-3 rounded-full bg-black/5 px-3 py-2 text-xs font-semibold text-zinc-700 transition-all duration-200 hover:bg-black/10"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}

        {signupOpen ? (
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            onMouseDown={() => setSignupOpen(false)}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            <div
              className="relative mx-4 w-full max-w-lg overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-b from-[#0b3a1a] to-[#0b3a1a]/90 px-8 py-8 text-center text-white">
                <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-white/10">
                  <span className="text-xl">⚖️</span>
                </div>
                <div className="text-xl font-semibold">Juriscan Account Registration</div>
                <div className="mt-1 text-xs text-white/80">AI-Powered Evidence Verification System</div>
                <div className="text-xs text-white/80">High Court of Zimbabwe</div>
              </div>

              <form onSubmit={onSignupSubmit} className="max-h-[70vh] space-y-5 overflow-auto px-8 py-6">
                {signupError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {signupError}
                  </div>
                ) : null}
                {signupSuccess ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {signupSuccess}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label className="text-xs font-semibold">
                    Full Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    value={signupFullName}
                    onChange={(e) => setSignupFullName(e.target.value)}
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition-all duration-200 hover:shadow-2xl hover:shadow-[#0b3a1a]/30 focus:border-[#0b3a1a]/80 focus:ring-4 focus:ring-[#0b3a1a]/35 focus:shadow-2xl focus:shadow-[#0b3a1a]/55"
                    placeholder="Enter your full name"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold">
                    Email Address <span className="text-red-600">*</span>
                  </label>
                  <input
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    type="email"
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition-all duration-200 hover:shadow-2xl hover:shadow-[#0b3a1a]/30 focus:border-[#0b3a1a]/80 focus:ring-4 focus:ring-[#0b3a1a]/35 focus:shadow-2xl focus:shadow-[#0b3a1a]/55"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold">
                    Password <span className="text-red-600">*</span>
                  </label>
                  <input
                    value={signupPassword}
                    onChange={(e) => setSignupPassword(e.target.value)}
                    type="password"
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition-all duration-200 hover:shadow-2xl hover:shadow-[#0b3a1a]/30 focus:border-[#0b3a1a]/80 focus:ring-4 focus:ring-[#0b3a1a]/35 focus:shadow-2xl focus:shadow-[#0b3a1a]/55"
                    placeholder="Create a password"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold">
                    Confirm Password <span className="text-red-600">*</span>
                  </label>
                  <input
                    value={signupConfirmPassword}
                    onChange={(e) => setSignupConfirmPassword(e.target.value)}
                    type="password"
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition-all duration-200 hover:shadow-2xl hover:shadow-[#0b3a1a]/30 focus:border-[#0b3a1a]/80 focus:ring-4 focus:ring-[#0b3a1a]/35 focus:shadow-2xl focus:shadow-[#0b3a1a]/55"
                    placeholder="Confirm your password"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold">
                    Organization <span className="text-red-600">*</span>
                  </label>
                  <input
                    value={signupOrganization}
                    onChange={(e) => setSignupOrganization(e.target.value)}
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none transition-all duration-200 hover:shadow-2xl hover:shadow-[#0b3a1a]/30 focus:border-[#0b3a1a]/80 focus:ring-4 focus:ring-[#0b3a1a]/35 focus:shadow-2xl focus:shadow-[#0b3a1a]/55"
                    placeholder="e.g., High Court Zimbabwe, Prosecutor's Office"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold">
                    Role <span className="text-red-600">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <button
                      type="button"
                      onClick={() => setSignupRole("investigator")}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 ${
                        signupRole === "investigator" ? "border-[#0b3a1a] bg-[#0b3a1a]/10" : "border-zinc-200 bg-white"
                      }`}
                    >
                      Investigator
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignupRole("prosecutor")}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 ${
                        signupRole === "prosecutor" ? "border-[#0b3a1a] bg-[#0b3a1a]/10" : "border-zinc-200 bg-white"
                      }`}
                    >
                      Prosecutor
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignupRole("custodian")}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 ${
                        signupRole === "custodian" ? "border-[#0b3a1a] bg-[#0b3a1a]/10" : "border-zinc-200 bg-white"
                      }`}
                    >
                      Forensic Officer
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignupRole("clerk")}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 ${
                        signupRole === "clerk" ? "border-[#0b3a1a] bg-[#0b3a1a]/10" : "border-zinc-200 bg-white"
                      }`}
                    >
                      Clerk
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold">
                    Justification for Access <span className="text-red-600">*</span>
                  </label>
                  <textarea
                    value={signupJustification}
                    onChange={(e) => setSignupJustification(e.target.value)}
                    className="min-h-[100px] w-full resize-none rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition-all duration-200 hover:shadow-2xl hover:shadow-[#0b3a1a]/25 focus:border-[#0b3a1a]/80 focus:ring-4 focus:ring-[#0b3a1a]/35 focus:shadow-2xl focus:shadow-[#0b3a1a]/55"
                    placeholder="Explain why you need access to the Juriscan evidence verification system..."
                    required
                  />
                </div>

                <label className="flex items-start gap-3 text-xs text-zinc-700">
                  <input
                    type="checkbox"
                    checked={signupAgree}
                    onChange={(e) => setSignupAgree(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-zinc-300"
                    required
                  />
                  <span>
                    I agree to the <span className="underline">Terms of Service</span> and <span className="underline">Privacy Policy</span>. I understand that
                    all actions are audited and chain-of-custody is immutable.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={signupBusy}
                  className={`h-12 w-full rounded-2xl bg-[#0b3a1a] text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-[#0b3a1a]/35 active:translate-y-0 ${
                    signupBusy ? "cursor-not-allowed opacity-70" : ""
                  }`}
                >
                  {signupBusy ? "Submitting..." : "Submit Access Request"}
                </button>

                <button
                  type="button"
                  onClick={clearSignup}
                  className="h-12 w-full rounded-2xl border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 active:translate-y-0"
                >
                  Clear Form
                </button>

                <div className="pt-2 text-center text-xs text-zinc-600">
                  Already have an account?{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setSignupOpen(false);
                      setMode("signin");
                    }}
                    className="font-semibold text-[#0b3a1a] underline underline-offset-4"
                  >
                    Sign in here
                  </button>
                </div>
              </form>

              <button
                type="button"
                onClick={() => setSignupOpen(false)}
                className="absolute right-3 top-3 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:bg-white/20"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}

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
