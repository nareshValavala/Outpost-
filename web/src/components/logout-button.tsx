"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    setBusy(true);
    await supabase.auth.signOut({ scope: "local" });
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={busy}
      className="rounded-md border border-white/10 px-2 py-1 text-[11px] uppercase tracking-wide text-white/60 transition hover:text-white disabled:opacity-50"
    >
      {busy ? "…" : "sign out"}
    </button>
  );
}
