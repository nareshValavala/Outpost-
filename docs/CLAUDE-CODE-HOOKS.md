# Claude Code Hook Configuration

This is the final wiring that makes Agent Mirror's write path actually work end-to-end. Without this, phone-typed messages stay queued in the daemon forever.

## What it does

Claude Code's `Stop` hook fires every time the assistant finishes a response. We hook into it: each time Stop fires, Claude Code calls our local daemon at `http://127.0.0.1:8787/hook`. If the daemon has nothing queued, it returns `{"decision":"allow"}` and Claude Code stops normally. If the daemon *does* have a queued message from your phone, it returns `{"decision":"block","reason":"<your text>"}`, and Claude Code injects that text as your next user prompt and continues.

## Where settings.json lives

You can add the hook in **either** of two places, depending on whether you want it everywhere or only in this project:

- **Global (every Claude Code project on this machine):** `C:\Users\Satya\.claude\settings.json`
- **Project-only (just `d:\Outpost-`):** `d:\Outpost-\.claude\settings.json`

For v1, **project-only is recommended** — it scopes the experiment to this repo so other Claude Code sessions you have running aren't affected.

## The hook config

Add this to the chosen `settings.json`. If the file doesn't exist yet, create it with exactly this content. If it does exist and already has a `hooks` key, merge the `Stop` array with whatever else is there.

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "curl.exe -s -X POST http://127.0.0.1:8787/hook -d \"{}\""
          }
        ]
      }
    ]
  }
}
```

### Notes per platform

- **Windows:** use `curl.exe`, not `curl` (PowerShell aliases `curl` to `Invoke-WebRequest`, which has different flags).
- **macOS / Linux:** use `curl` (no `.exe`).
- The hook command runs in your default shell. The JSON output of the command becomes the hook's response.
- The `-d "{}"` is a placeholder body — the daemon ignores it for v1.

## Testing the end-to-end flow

1. **Save the settings.json file** with the config above.
2. **In a brand-new Claude Code session, ask Claude something simple** — anything that produces a short response.
3. **Watch the daemon terminal.** When Claude finishes responding, the `Stop` hook fires, which calls the daemon. If the queue is empty, you'll see *nothing* in the daemon log (an empty queue is silent — no `[hook] delivering` line). That's expected.
4. **Now queue a message via the web app.** Open `localhost:3000`, type `please add a comment to this file` in the input box, send.
5. **Within 1.5 seconds**, daemon should print:
   ```
   [input-poll] enqueued id=<...> text="please add a comment to this file"
   ```
6. **In Claude Code, ask anything that produces a response.** When Claude finishes (Stop fires), it calls the daemon, the daemon returns the queued message, and Claude Code receives it as a new user message and continues.
7. **Daemon logs:**
   ```
   [hook] delivering id=<...> text="please add a comment to this file"
   ```
8. **In the Claude Code window**, you should see your phone-sent message appear as a new user turn, and Claude responding to it.
9. **Web app:** the amber "queued" card disappears.

If all of that happens, **the round trip works.** You can now:
- Type on phone → Claude Code receives → Claude Code acts → output streams back to phone via the read path.

## Known limitations (v1)

- **Hook only fires on Stop.** If Claude Code is in a long tool-use chain that never stops, the queued message waits until it does. This is fine for our use case (we *want* the message to land at the end of a turn, not interrupt mid-thought).
- **No matching by session.** The daemon serves whatever's in the queue to whoever calls. If you have multiple Claude Code sessions running with the same hook config, the first one to call gets the message. For single-user single-session use, this is fine. Multi-session is a future story.
- **No mid-response interruption.** You can't say "stop, do something else" in the middle of a response. The queued message lands at the next Stop event.
- **Hook timeout.** Claude Code has a default hook timeout (~60s I believe). The daemon's hook handler returns instantly, so this is not a concern in practice.

## Troubleshooting

**Hook fires but daemon shows nothing.**
→ Either the queue is empty (correct, silent allow) or the curl command is wrong. Test the command manually:
```
curl.exe -s -X POST http://127.0.0.1:8787/hook -d "{}"
```
If this works manually but Claude Code's hook doesn't, check the exact `command` string in `settings.json` for typos.

**Daemon delivers but Claude Code doesn't show the message as a new user turn.**
→ The hook output JSON might be malformed. The daemon's response should be valid JSON: `{"decision":"block","reason":"..."}`. If you see Claude Code complain about hook output, paste the error and we'll diagnose.

**"connection refused" from curl when called by Claude Code's hook.**
→ The daemon isn't running. Start it with `npm start` in `daemon/`.

**Hook never fires at all.**
→ Check the settings.json path is correct, the JSON is valid (run it through a JSON validator), and you reloaded the Claude Code window after editing.

**The hook fires on every Stop forever, even when you didn't queue anything.**
→ That's correct. Empty queue → fast `{"decision":"allow"}` response → no impact on Claude Code's behavior. Should be invisible to you.

## Disabling

To turn off the hook (e.g., when developing the daemon and you don't want the hook accidentally injecting test messages), just remove the `hooks` block from the settings.json file or move it to a backup name.
