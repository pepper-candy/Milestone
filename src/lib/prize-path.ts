import type { SupabaseClient } from "@supabase/supabase-js";
import systemTemplate from "@/data/prize-path-template.json";
import type { Milestone } from "@/types";

/** One stop in a mentee prize path (before or after persist). */
export type PrizePathStopInput = {
  gem_threshold: number;
  title?: string | null;
  prize_name?: string | null;
  prize_description?: string | null;
  icon?: string | null;
};

export type PrizePathStopRow = PrizePathStopInput & {
  id?: string;
  user_id?: string;
  sort?: number | null;
};

type WriteClient = SupabaseClient;

function asStopArray(value: unknown): PrizePathStopInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const gem = Number(r.gem_threshold);
      if (!Number.isFinite(gem) || gem <= 0) return null;
      return {
        gem_threshold: Math.floor(gem),
        title: typeof r.title === "string" ? r.title : "",
        prize_name:
          typeof r.prize_name === "string" ? r.prize_name : null,
        prize_description:
          typeof r.prize_description === "string"
            ? r.prize_description
            : null,
        icon: typeof r.icon === "string" ? r.icon : null,
      } satisfies PrizePathStopInput;
    })
    .filter((s): s is PrizePathStopInput => s != null);
}

/** System sample template (CSV / seed content). */
export function getSystemPrizePathTemplate(): PrizePathStopInput[] {
  return asStopArray(systemTemplate);
}

/**
 * Validate unique positive ascending gem thresholds.
 * Returns normalized stops or an error message.
 */
export function validatePrizePathStops(
  stops: PrizePathStopInput[],
): { ok: true; stops: PrizePathStopInput[] } | { ok: false; error: string } {
  if (!Array.isArray(stops)) {
    return { ok: false, error: "Stops must be an array" };
  }

  const normalized: PrizePathStopInput[] = [];
  const seen = new Set<number>();

  for (const raw of stops) {
    const gem = Math.floor(Number(raw?.gem_threshold));
    if (!Number.isFinite(gem) || gem <= 0) {
      return { ok: false, error: "Each stop needs a positive gem threshold" };
    }
    if (seen.has(gem)) {
      return {
        ok: false,
        error: `Duplicate gem threshold: ${gem}`,
      };
    }
    seen.add(gem);
    const prizeName =
      typeof raw.prize_name === "string" ? raw.prize_name.trim() : "";
    const title =
      typeof raw.title === "string" ? raw.title.trim() : "";
    normalized.push({
      gem_threshold: gem,
      title: title || prizeName || `${gem} gems`,
      prize_name: prizeName || title || null,
      prize_description:
        typeof raw.prize_description === "string"
          ? raw.prize_description.trim() || null
          : null,
      icon:
        typeof raw.icon === "string" ? raw.icon.trim() || null : null,
    });
  }

  normalized.sort((a, b) => a.gem_threshold - b.gem_threshold);
  return { ok: true, stops: normalized };
}

export function menteeRowsToMilestones(
  rows: PrizePathStopRow[] | null | undefined,
): Milestone[] {
  return (rows ?? [])
    .map((r) => ({
      id: (r.id as string) || `tmp-${r.gem_threshold}`,
      gem_threshold: Number(r.gem_threshold),
      title: r.title?.trim() || r.prize_name?.trim() || `${r.gem_threshold} gems`,
      prize_name: r.prize_name ?? null,
      prize_description: r.prize_description ?? null,
      icon: r.icon ?? null,
    }))
    .sort((a, b) => a.gem_threshold - b.gem_threshold);
}

/** Replace all stops for one mentee (delete + insert). */
export async function replaceMenteePrizePath(
  client: WriteClient,
  menteeUserId: string,
  stops: PrizePathStopInput[],
): Promise<{ error?: string }> {
  const validated = validatePrizePathStops(stops);
  if (!validated.ok) return { error: validated.error };

  const { error: delError } = await client
    .from("mentee_milestones")
    .delete()
    .eq("user_id", menteeUserId);

  if (delError) return { error: delError.message };

  if (validated.stops.length === 0) return {};

  const rows = validated.stops.map((s, i) => ({
    user_id: menteeUserId,
    gem_threshold: s.gem_threshold,
    title: s.title || "",
    prize_name: s.prize_name,
    prize_description: s.prize_description,
    icon: s.icon,
    sort: i,
  }));

  const { error: insError } = await client
    .from("mentee_milestones")
    .insert(rows);

  if (insError) return { error: insError.message };
  return {};
}

export async function fetchMenteePrizePath(
  client: WriteClient,
  menteeUserId: string,
): Promise<{ milestones: Milestone[]; error?: string }> {
  const { data, error } = await client
    .from("mentee_milestones")
    .select("*")
    .eq("user_id", menteeUserId)
    .order("gem_threshold");

  if (error) {
    return { milestones: [], error: error.message };
  }
  return { milestones: menteeRowsToMilestones(data as PrizePathStopRow[]) };
}

/** Seed system template when path is empty. Returns whether rows were inserted. */
export async function seedSystemPrizePathIfEmpty(
  client: WriteClient,
  menteeUserId: string,
): Promise<{ seeded: boolean; error?: string }> {
  const { count, error: countError } = await client
    .from("mentee_milestones")
    .select("id", { count: "exact", head: true })
    .eq("user_id", menteeUserId);

  if (countError) return { seeded: false, error: countError.message };
  if ((count ?? 0) > 0) return { seeded: false };

  const result = await replaceMenteePrizePath(
    client,
    menteeUserId,
    getSystemPrizePathTemplate(),
  );
  if (result.error) return { seeded: false, error: result.error };
  return { seeded: true };
}

/** Copy mentor default JSON stops onto a mentee if default is set. */
export async function copyMentorDefaultPrizePath(
  client: WriteClient,
  mentorUserId: string,
  menteeUserId: string,
): Promise<{ copied: boolean; error?: string }> {
  const { data: mentor, error } = await client
    .from("profiles")
    .select("prize_path_default")
    .eq("id", mentorUserId)
    .maybeSingle();

  if (error) return { copied: false, error: error.message };

  const stops = asStopArray(mentor?.prize_path_default);
  if (stops.length === 0) return { copied: false };

  const result = await replaceMenteePrizePath(client, menteeUserId, stops);
  if (result.error) return { copied: false, error: result.error };
  return { copied: true };
}

export async function saveMentorPrizePathDefault(
  client: WriteClient,
  mentorUserId: string,
  stops: PrizePathStopInput[],
): Promise<{ error?: string }> {
  const validated = validatePrizePathStops(stops);
  if (!validated.ok) return { error: validated.error };

  const { error } = await client
    .from("profiles")
    .update({ prize_path_default: validated.stops })
    .eq("id", mentorUserId);

  if (error) return { error: error.message };
  return {};
}
