import type { MessageRole } from "../../shared/types.js";

/**
 * A parsed JSONL entry the daemon cares about. The raw lines from Claude Code's
 * session file contain many entry types (queue-operation, file-history-snapshot,
 * attachment, ai-title, etc.) — we keep only user and assistant turns.
 *
 * Returns null for lines we should skip.
 */
export interface ParsedEntry {
  sessionId: string;
  cwd: string;
  role: MessageRole;
  content: string;
  timestamp: string;
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: unknown;
}

interface RawLine {
  type?: string;
  sessionId?: string;
  cwd?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: ContentBlock[] | string;
  };
}

export function parseLine(line: string): ParsedEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let obj: RawLine;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const type = obj.type;
  if (type !== "user" && type !== "assistant") return null;

  const sessionId = obj.sessionId;
  const cwd = obj.cwd;
  const timestamp = obj.timestamp;
  if (!sessionId || !cwd || !timestamp) return null;

  const content = renderContent(obj.message?.content);
  // Skip empty content — happens for e.g. tool-result-only assistant turns
  // where we have nothing human-readable to show. The real daemon in a later
  // phase can store richer structure.
  if (!content) return null;

  return {
    sessionId,
    cwd,
    role: type,
    content,
    timestamp,
  };
}

function renderContent(content: ContentBlock[] | string | undefined): string {
  if (!content) return "";
  if (typeof content === "string") return content;

  const parts: string[] = [];
  for (const block of content) {
    switch (block.type) {
      case "text":
        if (block.text) parts.push(block.text);
        break;
      case "thinking":
        if (block.thinking) parts.push(`[thinking] ${block.thinking}`);
        break;
      case "tool_use":
        parts.push(renderToolUse(block));
        break;
      case "tool_result":
        parts.push(`[tool_result]`);
        break;
      default:
        parts.push(`[${block.type}]`);
    }
  }
  return parts.join("\n").trim();
}

/**
 * Render a tool_use block with enough detail for the user to make an
 * approval decision from their phone.
 */
function renderToolUse(block: ContentBlock): string {
  const name = block.name ?? "unknown";
  const input = block.input;
  if (!input || typeof input !== "object") return `[tool: ${name}]`;

  switch (name) {
    case "Bash":
      return `[tool: Bash]\n$ ${input.command ?? ""}${input.description ? `\n(${input.description})` : ""}`;
    case "Write":
      return `[tool: Write]\nfile: ${input.file_path ?? "?"}\ncontent: ${String(input.content ?? "").slice(0, 300)}${String(input.content ?? "").length > 300 ? "…" : ""}`;
    case "Edit":
      return `[tool: Edit]\nfile: ${input.file_path ?? "?"}\nold: ${String(input.old_string ?? "").slice(0, 150)}\nnew: ${String(input.new_string ?? "").slice(0, 150)}`;
    case "Read":
      return `[tool: Read] ${input.file_path ?? "?"}`;
    case "Glob":
      return `[tool: Glob] ${input.pattern ?? "?"}`;
    case "Grep":
      return `[tool: Grep] ${input.pattern ?? "?"} in ${input.path ?? "."}`;
    default: {
      const summary = JSON.stringify(input).slice(0, 200);
      return `[tool: ${name}] ${summary}`;
    }
  }
}
