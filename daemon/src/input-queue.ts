/**
 * In-memory FIFO of pending phone-originated inputs the daemon owes
 * to Claude Code on the next hook callback.
 *
 * Per ADR-006: not durable. The Supabase `pending_inputs` table is the
 * source of truth — this queue is just a fast cache that gets rebuilt on
 * daemon restart by re-fetching unconsumed rows.
 */
export interface QueuedInput {
  id: string;        // pending_inputs.id from Supabase
  sessionId: string; // pending_inputs.session_id
  text: string;
}

export class InputQueue {
  private items: QueuedInput[] = [];
  private seen = new Set<string>();

  enqueue(item: QueuedInput): boolean {
    if (this.seen.has(item.id)) return false;
    this.seen.add(item.id);
    this.items.push(item);
    return true;
  }

  /** Peek at the next item without removing it. */
  peek(): QueuedInput | null {
    return this.items[0] ?? null;
  }

  /** Remove and return the next item. */
  dequeue(): QueuedInput | null {
    return this.items.shift() ?? null;
  }

  /**
   * Mark an item as no longer in flight. Used after the daemon successfully
   * delivers it via a hook callback. We do NOT clear `seen` so the same id
   * can't be re-enqueued if it sneaks back in via a stale Realtime event.
   */
  size(): number {
    return this.items.length;
  }

  /** Snapshot for debugging. */
  snapshot(): readonly QueuedInput[] {
    return this.items;
  }
}
