"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

interface Props {
  sessionId: string | null;
  disabled?: boolean;
  showApproval?: boolean;
}

export function MessageInput({ sessionId, disabled, showApproval }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !sessionId || busy) return;
    setBusy(true);
    setErrorMsg(null);

    const { error } = await supabase
      .from("pending_inputs")
      .insert({ session_id: sessionId, text: trimmed });

    if (error) {
      setErrorMsg(error.message);
      setBusy(false);
      return;
    }

    setText("");
    setBusy(false);
  }

  const isDisabled = disabled || !sessionId || busy;

  async function sendQuick(quickText: string) {
    if (!sessionId || busy) return;
    setBusy(true);
    setErrorMsg(null);
    const { error } = await supabase
      .from("pending_inputs")
      .insert({ session_id: sessionId, text: quickText });
    if (error) setErrorMsg(error.message);
    setBusy(false);
  }

  return (
    <div
      className="sticky bottom-0 border-t border-white/10 bg-[#0b0b0d]/95 px-3 pt-2 backdrop-blur"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)" }}
    >
      {errorMsg && <p className="mb-1 text-xs text-red-300">error: {errorMsg}</p>}

      {/* Quick-action buttons — only show when latest message is a tool call */}
      {showApproval && <div className="mb-2 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => sendQuick("1")}
          disabled={isDisabled}
          className="min-h-10 w-full rounded-lg bg-emerald-600 px-3 text-left text-sm font-medium text-white transition enabled:hover:bg-emerald-500 disabled:opacity-50"
        >
          1. Yes
        </button>
        <button
          type="button"
          onClick={() => sendQuick("2")}
          disabled={isDisabled}
          className="min-h-10 w-full rounded-lg bg-amber-600 px-3 text-left text-sm font-medium text-white transition enabled:hover:bg-amber-500 disabled:opacity-50"
        >
          2. Yes, allow all for this session
        </button>
        <button
          type="button"
          onClick={() => sendQuick("3")}
          disabled={isDisabled}
          className="min-h-10 w-full rounded-lg bg-red-600 px-3 text-left text-sm font-medium text-white transition enabled:hover:bg-red-500 disabled:opacity-50"
        >
          3. No
        </button>
      </div>}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit(e as unknown as FormEvent);
            }
          }}
          placeholder={sessionId ? "type a message…" : "no active session"}
          rows={1}
          disabled={isDisabled}
          suppressHydrationWarning
          className="max-h-32 min-h-11 flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-base text-white placeholder:text-white/30 focus:border-sky-400/60 focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isDisabled || !text.trim()}
          className="min-h-11 rounded-lg bg-sky-500 px-4 text-sm font-semibold text-white transition enabled:hover:bg-sky-400 disabled:opacity-50"
        >
          {busy ? "…" : "send"}
        </button>
      </form>
    </div>
  );
}
