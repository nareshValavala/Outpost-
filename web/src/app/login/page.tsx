"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Status = "idle" | "busy" | "error";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setStatus("busy");
    setErrorMsg(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }

    // Middleware will pick up the session cookie on the next request.
    router.replace("/");
    router.refresh();
  }

  return (
    <main
      className="flex flex-col items-center justify-center px-6"
      style={{
        minHeight: "100dvh",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-xl font-semibold">Agent Mirror</h1>
        <p className="mb-6 text-sm text-white/60">Sign in to view your live Claude Code session.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "busy"}
            suppressHydrationWarning
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none"
          />
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={status === "busy"}
            suppressHydrationWarning
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={status === "busy" || !email || !password}
            className="min-h-11 rounded-lg bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition enabled:hover:bg-sky-400 disabled:opacity-50"
          >
            {status === "busy" ? "signing in…" : "sign in"}
          </button>
        </form>

        {status === "error" && <p className="mt-4 text-sm text-red-300">error: {errorMsg}</p>}
      </div>
    </main>
  );
}
