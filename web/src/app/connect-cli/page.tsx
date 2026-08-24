"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Status = "loading" | "posting" | "success" | "error" | "unauthenticated";

function ConnectCliInner() {
  const searchParams = useSearchParams();
  const callback = searchParams.get("callback");
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!callback) {
      setStatus("error");
      setErrorMsg("missing ?callback=<url> query parameter");
      return;
    }

    async function connect() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) {
          setStatus("unauthenticated");
          return;
        }

        setStatus("posting");
        const res = await fetch(callback!, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_at: data.session.expires_at ?? null,
            user_id: data.session.user.id,
            email: data.session.user.email ?? "",
          }),
        });
        if (!res.ok) throw new Error(`callback returned ${res.status}`);
        setStatus("success");
      } catch (err) {
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : String(err));
      }
    }

    void connect();
  }, [callback]);

  return (
    <div className="w-full max-w-sm text-center">
      <h1 className="mb-4 text-xl font-semibold">Connect CLI</h1>
      {status === "loading" && <p className="text-white/60">Getting session…</p>}
      {status === "posting" && <p className="text-white/60">Sending to CLI…</p>}
      {status === "success" && (
        <>
          <p className="mb-2 text-lg text-emerald-400">✓ Connected</p>
          <p className="text-sm text-white/60">You can close this tab and return to the terminal.</p>
        </>
      )}
      {status === "unauthenticated" && (
        <p className="text-amber-300">Please log in first, then return to this page.</p>
      )}
      {status === "error" && (
        <>
          <p className="mb-2 text-lg text-red-400">Error</p>
          <p className="text-sm text-white/60">{errorMsg}</p>
        </>
      )}
    </div>
  );
}

export default function ConnectCliPage() {
  return (
    <main
      className="flex flex-col items-center justify-center px-6"
      style={{ minHeight: "100dvh" }}
    >
      <Suspense fallback={<p className="text-white/60">Loading…</p>}>
        <ConnectCliInner />
      </Suspense>
    </main>
  );
}
