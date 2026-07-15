import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/** Lightweight ping — which dashboard slice changed (not the row data). */
export type FamilySyncPart = "tasks" | "sessions" | "dashboard";

export type FamilySyncPayload = {
  part: FamilySyncPart;
  /** Skip refresh on the device that already updated locally. */
  senderId: string;
  childId: string;
};

export function familyChannelName(childId: string): string {
  return `family-sync:${childId}`;
}

/** Stable per-tab id so we ignore our own pings. */
export function getFamilySyncSenderId(): string {
  if (typeof window === "undefined") return "ssr";
  const key = "milestone.familySync.senderId";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

/** Long-lived channels keyed by child id (owned by subscribeFamilySync). */
const liveChannels = new Map<string, RealtimeChannel>();

/**
 * Fire a tiny Broadcast ping on the child's family channel.
 * Prefers an already-subscribed channel so we never spin up extra auth clients.
 */
export async function notifyFamilySync(
  childId: string,
  part: FamilySyncPart,
  senderId: string = getFamilySyncSenderId(),
): Promise<void> {
  if (!childId) return;
  const payload: FamilySyncPayload = { part, senderId, childId };
  const existing = liveChannels.get(childId);
  if (existing) {
    try {
      await existing.send({
        type: "broadcast",
        event: "family_sync",
        payload,
      });
    } catch {
      // Non-fatal — local UI already updated
    }
    return;
  }

  // Fallback when this tab is not listening (rare): one-shot send.
  const supabase = createClient();
  const channel = supabase.channel(familyChannelName(childId), {
    config: { broadcast: { self: false } },
  });

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      void supabase.removeChannel(channel);
      resolve();
    }, 2000);

    channel.subscribe((status: string) => {
      if (status !== "SUBSCRIBED") return;
      window.clearTimeout(timeout);
      void channel
        .send({ type: "broadcast", event: "family_sync", payload })
        .finally(() => {
          void supabase.removeChannel(channel);
          resolve();
        });
    });
  });
}

export type FamilySyncHandler = (payload: FamilySyncPayload) => void;

/**
 * Listen on one or more child family channels for sync pings.
 * Returns an unsubscribe cleanup.
 */
export function subscribeFamilySync(
  childIds: string[],
  onPing: FamilySyncHandler,
  senderId: string = getFamilySyncSenderId(),
): () => void {
  const ids = [...new Set(childIds.filter(Boolean))];
  if (ids.length === 0) return () => {};

  const supabase: SupabaseClient = createClient();
  const joined: string[] = [];

  for (const childId of ids) {
    if (liveChannels.has(childId)) continue;

    const channel = supabase
      .channel(familyChannelName(childId), {
        config: { broadcast: { self: false } },
      })
      .on("broadcast", { event: "family_sync" }, ({ payload }) => {
        const data = payload as FamilySyncPayload;
        if (!data?.part || data.senderId === senderId) return;
        if (data.childId && data.childId !== childId) return;
        onPing({ ...data, childId });
      });

    channel.subscribe();
    liveChannels.set(childId, channel);
    joined.push(childId);
  }

  return () => {
    for (const childId of joined) {
      const ch = liveChannels.get(childId);
      if (!ch) continue;
      liveChannels.delete(childId);
      void supabase.removeChannel(ch);
    }
  };
}
