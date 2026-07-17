import type { SupabaseClient } from "@supabase/supabase-js";

function formatSupabaseError(error: {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}): string {
  return [error.message, error.code, error.details, error.hint]
    .filter(Boolean)
    .join(" | ");
}

/**
 * New mentees start with an empty list — no bulk seed from the shared catalog.
 * Parents assign tasks via create / Import Sample Template.
 * Kept as a no-op so older call sites stay safe if any remain.
 */
export async function ensureUserTasks(
  _supabase: SupabaseClient,
  _userId: string,
): Promise<{ created: number; error?: string }> {
  return { created: 0 };
}

/** Resolve parent linked_children invitation codes → profile UUIDs. */
export async function resolveLinkedChildIds(
  supabase: SupabaseClient,
  linkedChildrenCodes: string[] | null | undefined,
): Promise<string[]> {
  const codes = (linkedChildrenCodes ?? []).filter(Boolean);
  if (codes.length === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .in("invitation_code", codes);

  if (error) {
    console.warn("Error resolving linked children:", formatSupabaseError(error));
    return [];
  }

  return (data ?? []).map((row) => row.id as string);
}

/** Resolve parent's selected (or first) linked child invitation code → profile UUID. */
export async function resolveSelectedChildId(
  supabase: SupabaseClient,
  profile: {
    linked_children?: string[] | null;
    selected_child_code?: string | null;
  },
): Promise<string | null> {
  const codes = (profile.linked_children ?? []).filter(Boolean);
  if (codes.length === 0) return null;

  let selectedCode = profile.selected_child_code?.trim() || null;
  if (!selectedCode || !codes.includes(selectedCode)) {
    selectedCode = codes[0] ?? null;
  }
  if (!selectedCode) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("invitation_code", selectedCode)
    .maybeSingle();

  if (error) {
    console.warn(
      "Error resolving selected child:",
      formatSupabaseError(error),
    );
    return null;
  }

  return (data?.id as string | undefined) ?? null;
}

/** First linked child — used when a parent credits sessions to the child record. */
export async function resolvePrimaryChildId(
  supabase: SupabaseClient,
  linkedChildrenCodes: string[] | null | undefined,
  selectedChildCode?: string | null,
): Promise<string | null> {
  return resolveSelectedChildId(supabase, {
    linked_children: linkedChildrenCodes,
    selected_child_code: selectedChildCode,
  });
}

/**
 * Resolve whose tasks to load. Does not seed assignments — mentees start blank.
 * Children: own id. Parents: selected (or first) linked child.
 */
export async function ensureTasksForViewer(
  supabase: SupabaseClient,
  profile: {
    id: string;
    is_child: boolean;
    linked_children?: string[] | null;
    selected_child_code?: string | null;
  },
): Promise<{ created: number; error?: string; subjectUserIds: string[] }> {
  if (profile.is_child) {
    return { created: 0, subjectUserIds: [profile.id] };
  }

  const childId = await resolveSelectedChildId(supabase, profile);
  return { created: 0, subjectUserIds: childId ? [childId] : [] };
}

/** Load user_tasks for the viewer — own rows (child) or linked children (parent). */
export async function fetchViewerUserTasks(
  supabase: SupabaseClient,
  subjectUserIds: string[],
) {
  if (subjectUserIds.length === 0) {
    return { data: [] as { id: string; user_id: string; task_id: string; status: string; completed_at: string | null; proof_data: unknown }[], error: null };
  }

  return supabase
    .from("user_tasks")
    .select("*")
    .in("user_id", subjectUserIds);
}
