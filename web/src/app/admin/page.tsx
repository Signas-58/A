"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type NavItem = {
  key: "dashboard" | "requests" | "users" | "audit" | "evidence";
  label: string;
};

type SubTab = {
  key: "pending" | "activity" | "health";
  label: string;
};

type UserOut = {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
  organization?: string | null;
  justification?: string | null;
  failed_attempts: number;
  created_at?: string | null;
  updated_at?: string | null;
};

export default function AdminDashboardPage() {
  const router = useRouter();

  const apiBaseUrl = useMemo(() => {
    const raw = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";
    return raw.replace(/\/+$/, "");
  }, []);

  const navItems = useMemo<NavItem[]>(
    () => [
      { key: "dashboard", label: "Dashboard" },
      { key: "requests", label: "Access Requests" },
      { key: "users", label: "User Management" },
      { key: "audit", label: "Audit Log" },
      { key: "evidence", label: "All Evidence" },
    ],
    []
  );

  const [active, setActive] = useState<NavItem["key"]>("dashboard");
  const subtabs = useMemo<SubTab[]>(
    () => [
      { key: "pending", label: "Pending Requests" },
      { key: "activity", label: "Recent Activity" },
      { key: "health", label: "System Health" },
    ],
    []
  );
  const [subtab, setSubtab] = useState<SubTab["key"]>("pending");

  const [pending, setPending] = useState<UserOut[]>([]);
  const [users, setUsers] = useState<UserOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchAll() {
    setLoading(true);
    setError(null);
    try {
      const [pendingRes, usersRes] = await Promise.all([
        fetch(`${apiBaseUrl}/admin/access-requests`),
        fetch(`${apiBaseUrl}/admin/users`),
      ]);

      if (!pendingRes.ok) {
        const t = await pendingRes.text();
        throw new Error(`Failed to load access requests (${pendingRes.status}): ${t}`);
      }
      if (!usersRes.ok) {
        const t = await usersRes.text();
        throw new Error(`Failed to load users (${usersRes.status}): ${t}`);
      }

      const pendingData = (await pendingRes.json()) as UserOut[];
      const usersData = (await usersRes.json()) as UserOut[];
      setPending(Array.isArray(pendingData) ? pendingData : []);
      setUsers(Array.isArray(usersData) ? usersData : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }

  async function adminAction(userId: number, action: "approve" | "block" | "unblock" | "disable" | "enable" | "unlock") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/admin/users/${userId}/${action}`, { method: "POST" });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Action '${action}' failed (${res.status}): ${t}`);
      }
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    return [
      { label: "Total Users", value: users.length, icon: "👥" },
      { label: "Evidence Items", value: 0, icon: "📁" },
      { label: "Pending Requests", value: pending.length, icon: "🟡" },
      { label: "Audit Log Entries", value: 0, icon: "🔐" },
    ];
  }, [pending.length, users.length]);

  const panelTitle = useMemo(() => {
    if (active === "requests") return "Access Requests";
    if (active === "users") return "User Management";
    if (active === "audit") return "Audit Log";
    if (active === "evidence") return "All Evidence";
    return "Access Requests Waiting for Approval";
  }, [active]);

  return (
    <div className="min-h-screen w-screen bg-zinc-100 text-zinc-950">
      <div className="flex min-h-screen">
        <aside className="w-[260px] bg-[#1f6b2b] text-white">
          <div className="px-6 py-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/10 text-2xl">⚖️</div>
            <div className="mt-4 text-lg font-semibold">Juriscan</div>
            <div className="text-xs text-white/80">Admin Portal</div>
          </div>

          <nav className="px-4 pb-8">
            <div className="space-y-2">
              {navItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActive(item.key)}
                  className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold transition-all duration-200 hover:bg-white/10 ${
                    active === item.key ? "bg-[#f0b429] text-[#1f6b2b]" : "text-white"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="mt-6 border-t border-white/15 pt-4">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="w-full rounded-xl bg-white/10 px-4 py-3 text-left text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/15 hover:shadow-lg hover:shadow-black/20 active:translate-y-0"
              >
                Logout
              </button>
            </div>
          </nav>
        </aside>

        <main className="flex-1 px-8 py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-[#1f6b2b]">Admin Dashboard</h1>
              <p className="mt-1 text-sm text-zinc-600">Manage users, review requests, and monitor system activity</p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-3 shadow-sm">
              <div className="text-sm font-semibold">Admin</div>
              <div className="text-xs text-zinc-500">Account details placeholder</div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-3xl font-semibold text-[#1f6b2b] tabular-nums">{s.value}</div>
                    <div className="mt-1 text-xs text-zinc-500">{s.label}</div>
                  </div>
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-zinc-100 text-xl">{s.icon}</div>
                </div>
              </div>
            ))}
          </div>

          {error ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {active === "dashboard" ? (
            <div className="mt-6">
              <div className="flex flex-wrap gap-3">
                {subtabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setSubtab(t.key)}
                    className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 active:translate-y-0 ${
                      subtab === t.key ? "bg-[#1f6b2b] text-white" : "bg-white text-zinc-700 border border-zinc-200"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-[#1f6b2b]">{subtab === "pending" ? "Access Requests Waiting for Approval" : subtab === "activity" ? "Recent Activity" : "System Health"}</h2>
                  <button
                    type="button"
                    onClick={() => void fetchAll()}
                    className="rounded-xl bg-[#1f6b2b] px-4 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 active:translate-y-0"
                  >
                    {loading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>

                {subtab === "pending" ? (
                  pending.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-600">No access requests yet.</div>
                  ) : (
                    <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-50 text-xs text-zinc-600">
                          <tr>
                            <th className="px-4 py-3 font-semibold">User</th>
                            <th className="px-4 py-3 font-semibold">Role</th>
                            <th className="px-4 py-3 font-semibold">Organization</th>
                            <th className="px-4 py-3 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 bg-white">
                          {pending.map((u) => (
                            <tr key={u.id} className="text-sm">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-zinc-900">{u.username}</div>
                                <div className="text-xs text-zinc-500">{u.email}</div>
                              </td>
                              <td className="px-4 py-3 text-zinc-700">{u.role}</td>
                              <td className="px-4 py-3 text-zinc-700">{u.organization || "—"}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void adminAction(u.id, "approve")}
                                    className="rounded-xl bg-[#1f6b2b] px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 active:translate-y-0"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void adminAction(u.id, "block")}
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 active:translate-y-0"
                                  >
                                    Block
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : (
                  <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-600">
                    {subtab === "activity" ? "No recent activity yet." : "No health alerts."}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <section className="mt-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-[#1f6b2b]">{panelTitle}</h2>
                <button
                  type="button"
                  onClick={() => void fetchAll()}
                  className="rounded-xl bg-[#1f6b2b] px-4 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 active:translate-y-0"
                >
                  {loading ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {active === "requests" ? (
                pending.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-600">No access requests yet.</div>
                ) : (
                  <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-zinc-50 text-xs text-zinc-600">
                        <tr>
                          <th className="px-4 py-3 font-semibold">User</th>
                          <th className="px-4 py-3 font-semibold">Role</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 bg-white">
                        {pending.map((u) => (
                          <tr key={u.id}>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-zinc-900">{u.username}</div>
                              <div className="text-xs text-zinc-500">{u.email}</div>
                            </td>
                            <td className="px-4 py-3 text-zinc-700">{u.role}</td>
                            <td className="px-4 py-3 text-zinc-700">{u.status}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void adminAction(u.id, "approve")}
                                  className="rounded-xl bg-[#1f6b2b] px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 active:translate-y-0"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void adminAction(u.id, "block")}
                                  className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 active:translate-y-0"
                                >
                                  Block
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : null}

              {active === "users" ? (
                users.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-600">No users to manage yet.</div>
                ) : (
                  <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-zinc-50 text-xs text-zinc-600">
                        <tr>
                          <th className="px-4 py-3 font-semibold">User</th>
                          <th className="px-4 py-3 font-semibold">Role</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold">Failed Attempts</th>
                          <th className="px-4 py-3 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 bg-white">
                        {users.map((u) => (
                          <tr key={u.id}>
                            <td className="px-4 py-3">
                              <div className="font-semibold text-zinc-900">{u.username}</div>
                              <div className="text-xs text-zinc-500">{u.email}</div>
                            </td>
                            <td className="px-4 py-3 text-zinc-700">{u.role}</td>
                            <td className="px-4 py-3 text-zinc-700">{u.status}</td>
                            <td className="px-4 py-3 text-zinc-700 tabular-nums">{u.failed_attempts}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                {u.status === "blocked" ? (
                                  <button
                                    type="button"
                                    onClick={() => void adminAction(u.id, "unblock")}
                                    className="rounded-xl bg-[#1f6b2b] px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 active:translate-y-0"
                                  >
                                    Unblock
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void adminAction(u.id, "block")}
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 active:translate-y-0"
                                  >
                                    Block
                                  </button>
                                )}

                                {u.status === "disabled" ? (
                                  <button
                                    type="button"
                                    onClick={() => void adminAction(u.id, "enable")}
                                    className="rounded-xl bg-[#1f6b2b] px-3 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#1f6b2b]/25 active:translate-y-0"
                                  >
                                    Enable
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => void adminAction(u.id, "disable")}
                                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 active:translate-y-0"
                                  >
                                    Disable
                                  </button>
                                )}

                                {u.status === "locked" ? (
                                  <button
                                    type="button"
                                    onClick={() => void adminAction(u.id, "unlock")}
                                    className="rounded-xl bg-[#f0b429] px-3 py-2 text-xs font-semibold text-[#1f6b2b] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 active:translate-y-0"
                                  >
                                    Unlock
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : null}

              {active === "audit" ? (
                <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-600">No audit log entries yet.</div>
              ) : null}
              {active === "evidence" ? (
                <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm text-zinc-600">No evidence items yet.</div>
              ) : null}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
