"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { apiGet, apiSend, ApiClientError } from "@/lib/api-client";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
};

export function AuthControls() {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiGet<AuthUser | null>("/api/auth/me"),
  });

  const [mode, setMode] = useState<"login" | "register" | null>(null);
  const [email, setEmail] = useState("alice@example.com");
  const [name, setName] = useState("Alice Demo");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refreshAll() {
    await queryClient.invalidateQueries({ queryKey: ["auth"] });
    await queryClient.invalidateQueries({ queryKey: ["todos"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["calendar"] });
    await queryClient.invalidateQueries({ queryKey: ["graph"] });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await apiSend<AuthUser>("/api/auth/register", "POST", {
          email,
          name,
          password,
        });
      } else {
        await apiSend<AuthUser>("/api/auth/login", "POST", {
          email,
          password,
        });
      }
      setMode(null);
      await refreshAll();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setBusy(true);
    try {
      await apiSend("/api/auth/logout", "POST");
      await refreshAll();
    } finally {
      setBusy(false);
    }
  }

  if (meQuery.data) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="hidden text-slate-600 sm:inline">{meQuery.data.name}</span>
        <button
          type="button"
          className="rounded-md border border-slate-300 px-2 py-1"
          onClick={() => void onLogout()}
          disabled={busy}
        >
          Log out
        </button>
      </div>
    );
  }

  if (!mode) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          className="rounded-md border border-slate-300 px-2 py-1"
          onClick={() => setMode("login")}
        >
          Log in
        </button>
        <button
          type="button"
          className="rounded-md bg-indigo-600 px-2 py-1 text-white"
          onClick={() => setMode("register")}
        >
          Register
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className="flex flex-wrap items-end gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 text-sm"
    >
      {mode === "register" ? (
        <label className="grid gap-1">
          <span className="text-xs text-slate-500">Name</span>
          <input
            className="rounded border border-slate-300 px-2 py-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
      ) : null}
      <label className="grid gap-1">
        <span className="text-xs text-slate-500">Email</span>
        <input
          type="email"
          className="rounded border border-slate-300 px-2 py-1"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label className="grid gap-1">
        <span className="text-xs text-slate-500">Password</span>
        <input
          type="password"
          className="rounded border border-slate-300 px-2 py-1"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </label>
      <button
        type="submit"
        className="rounded-md bg-indigo-600 px-3 py-1 text-white"
        disabled={busy}
      >
        {mode === "register" ? "Create account" : "Sign in"}
      </button>
      <button
        type="button"
        className="rounded-md border border-slate-300 px-2 py-1"
        onClick={() => {
          setMode(null);
          setError(null);
        }}
      >
        Cancel
      </button>
      {error ? <p className="w-full text-xs text-red-600">{error}</p> : null}
    </form>
  );
}
