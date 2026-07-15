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

/**
 * Fire a tiny Broadcast ping on the child's family channel.
 * Listeners refetch in the background — no row-level Realtime.
 */
export async function notifyFamilySync(
  childId: string,
  part: FamilySyncPart,
  senderId: string = getFamilySyncSenderId(),
): Promise<void> {
  if (!childId) return;
  const supabase = createClient();
  const channel = supabase.channel(familyChannelName(childId), {
    config: { broadcast: { self: false } },
  });

  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      void supabase.removeChannel(channel);
      resolve();
    }, 2500);

    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;
      window.clearTimeout(timeout);
      const payload: FamilySyncPayload = { part, senderId, childId };
      await channel.send({
        type: "broadcast",
        event: "family_sync",
        payload,
      });
      void supabase.removeChannel(channel);
      resolve();
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
  const channels: RealtimeChannel[] = [];

  for (const childId of ids) {
    const channel = supabase
      .channel(familyChannelName(childId), {
        config: { broadcast: { self: false } },
      })
      .on(
        "broadcast",
        { event: "family_sync" },
        ({ payload }) => {
          const data = payload as FamilySyncPayload;
          if (!data?.part || data.senderId === senderId) return;
          if (data.childId && data.childId !== childId) return;
          onPing({ ...data, childId });
        },
      );
    channel.subscribe();
    channels.push(channel);
  }

  return () => {
    for (const ch of channels) {
      void supabase.removeChannel(ch);
    }
  };
}
