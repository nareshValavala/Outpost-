"use client";

import { useEffect, useRef, useState } from "react";
import {
  supabase,
  type MessageRow,
  type PendingInputRow,
  type SessionRow,
} from "@/lib/supabase";
import { LogoutButton } from "@/components/logout-button";
import { MessageInput } from "@/components/message-input";

type LoadState = "loading" | "picking" | "ready" | "error";

export default function HomePage() {
  const [status, setStatus] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [session, setSession] = useState<SessionRow | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [pending, setPending] = useState<PendingInputRow[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  // Load the list of available sessions so the user can pick one.
  useEffect(() => {
    let cancelled = false;

    async function loadSessions() {
      try {
        const { data, error } = await supabase
          .from("sessions")
          .select("*")
          .order("last_seen_at", { ascending: false });
        if (error) throw error;
        if (cancelled) return;
        setSessions((data ?? []) as SessionRow[]);
        setStatus("picking");
      } catch (err: unknown) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    }

    void loadSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  // Once the user picks a session, load its messages + subscribe to realtime.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function load() {
      try {
        const [{ data: msgRows, error: msgErr }, { data: pendRows, error: pendErr }] =
          await Promise.all([
            supabase
              .from("messages")
              .select("*")
              .eq("session_id", session!.id)
              .order("seq", { ascending: true })
              .limit(200),
            supabase
              .from("pending_inputs")
              .select("*")
              .eq("session_id", session!.id)
              .is("consumed_at", null)
              .order("created_at", { ascending: true }),
          ]);
        if (msgErr) throw msgErr;
        if (pendErr) throw pendErr;
        if (cancelled) return;
        setMessages((msgRows ?? []) as MessageRow[]);
        setPending((pendRows ?? []) as PendingInputRow[]);
        setStatus("ready");
      } catch (err: unknown) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    }

    void load();

    const channel = supabase
      .channel(`session:${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          const row = payload.new as MessageRow;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row].sort((a, b) => a.seq - b.seq);
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "pending_inputs",
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          const row = payload.new as PendingInputRow;
          setPending((prev) => {
            if (prev.some((p) => p.id === row.id)) return prev;
            return [...prev, row];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pending_inputs",
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          const row = payload.new as PendingInputRow;
          setPending((prev) =>
            row.consumed_at
              ? prev.filter((p) => p.id !== row.id)
              : prev.map((p) => (p.id === row.id ? row : p)),
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [session]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending.length]);

  function pickSession(s: SessionRow) {
    setMessages([]);
    setPending([]);
    setStatus("loading");
    setSession(s);
  }

  async function backToPicker() {
    setSession(null);
    setMessages([]);
    setPending([]);
    setStatus("loading");
    try {
      const { data, error } = await supabase
        .from("sessions")
        .select("*")
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      setSessions((data ?? []) as SessionRow[]);
      setStatus("picking");
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main
      className="flex flex-col"
      style={{
        minHeight: "100dvh",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/10 bg-[#0b0b0d]/90 px-4 py-3 backdrop-blur">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Agent Mirror</div>
          <div className="truncate text-xs text-white/50">
            {session
              ? session.cwd
              : status === "loading"
                ? "loading…"
                : status === "picking"
                  ? "choose a session"
                  : "no active session"}
          </div>
        </div>
        {session && (
          <button
            type="button"
            onClick={backToPicker}
            className="rounded-md border border-white/10 px-2 py-1 text-[11px] uppercase tracking-wide text-white/60 transition hover:text-white"
          >
            change
          </button>
        )}
        <LogoutButton />
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {status === "loading" && (
          <div className="text-sm text-white/50">loading…</div>
        )}
        {status === "error" && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            error: {errorMsg}
          </div>
        )}
        {status === "picking" && sessions.length === 0 && (
          <div className="text-sm text-white/50">
            no sessions yet. Start the daemon and interact with Claude Code.
          </div>
        )}
        {status === "picking" && sessions.length > 0 && (
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => pickSession(s)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-left transition hover:border-white/30 hover:bg-white/10"
                >
                  <div className="truncate text-sm text-white/90">{s.cwd}</div>
                  <div className="mt-1 text-[11px] text-white/40">
                    last seen {formatRelative(s.last_seen_at)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
        {status === "ready" && messages.length === 0 && (
          <div className="text-sm text-white/50">
            no messages yet. Interact with Claude Code to see them here.
          </div>
        )}
        {status === "ready" && (
          <ul className="flex flex-col gap-3">
            {messages.map((m) => (
              <li
                key={m.id}
                className={
                  "rounded-lg border px-3 py-2 text-sm leading-relaxed " +
                  roleClass(m.role)
                }
              >
                <div className="mb-1 text-[11px] uppercase tracking-wide text-white/40">
                  {m.role} · #{m.seq}
                </div>
                <div className="whitespace-pre-wrap break-words text-white/90">
                  {m.content}
                </div>
              </li>
            ))}
            {pending.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm leading-relaxed"
              >
                <div className="mb-1 text-[11px] uppercase tracking-wide text-amber-300/70">
                  queued · waiting for hook
                </div>
                <div className="whitespace-pre-wrap break-words text-white/90">
                  {p.text}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div ref={endRef} aria-hidden="true" />
      </div>

      {status === "ready" && (
        <MessageInput
          sessionId={session?.id ?? null}
          showApproval={
            messages.length > 0 &&
            messages[messages.length - 1].content.includes("[tool:")
          }
        />
      )}
    </main>
  );
}

function roleClass(role: MessageRow["role"]): string {
  switch (role) {
    case "user":
      return "border-sky-500/20 bg-sky-500/5";
    case "assistant":
      return "border-emerald-500/20 bg-emerald-500/5";
    default:
      return "border-white/10 bg-white/5";
  }
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}
