/**
 * One-time interactive bootstrap: prompts for email + password, signs in
 * against Supabase, and saves the session to ~/.agent-mirror/auth.json.
 *
 * Run with: npm run bootstrap
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_FILE } from "./config.js";
import { saveStoredSession } from "./auth-storage.js";

async function main(): Promise<void> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log("Agent Mirror — daemon auth bootstrap");
    console.log(`Saves to: ${AUTH_FILE}`);
    console.log();

    const email = (await rl.question("email: ")).trim();
    if (!email) {
      console.error("[bootstrap] email is required");
      process.exit(1);
    }

    // Password is echoed — this is a local-machine, one-time setup step for a
    // personal tool. Hidden input adds TTY complexity for negligible value.
    const password = (await rl.question("password: ")).trim();
    if (!password) {
      console.error("[bootstrap] password is required");
      process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      console.error(`[bootstrap] sign-in failed: ${error?.message ?? "no session returned"}`);
      process.exit(1);
    }

    const session = data.session;
    saveStoredSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at ?? null,
      user_id: data.user.id,
      email: data.user.email ?? email,
    });

    console.log();
    console.log(`[bootstrap] success. Logged in as ${data.user.email}`);
    console.log(`[bootstrap] auth.json saved (chmod 0600 on POSIX systems).`);
    console.log(`[bootstrap] you can now run: npm start`);
  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error("[bootstrap] unexpected error:", err);
  process.exit(1);
});
