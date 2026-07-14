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
 * Backfill user_tasks for one user (only rows they are missing).
 * RLS only allows inserting rows where user_id = auth.uid(), so this must run
 * while that user is logged in (or via SQL as a privileged role).
 */
export async function ensureUserTasks(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ created: number; error?: string }> {
  const { data: existing, error: existingError } = await supabase
    .from("user_tasks")
    .select("task_id")
    .eq("user_id", userId);

  if (existingError) {
    console.warn(
      "Error checking user tasks:",
      formatSupabaseError(existingError),
    );
    return { created: 0, error: formatSupabaseError(existingError) };
  }

  const { data: allTasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id");

  if (tasksError) {
    console.warn("Error fetching tasks:", formatSupabaseError(tasksError));
    return { created: 0, error: formatSupabaseError(tasksError) };
  }

  if (!allTasks || allTasks.length === 0) {
    console.warn(
      "⚠️ tasks table empty or unreadable — run supabase/fix_grants_rls_backfill.sql",
    );
    return {
      created: 0,
      error:
        "Task catalog is empty or blocked by database permissions. Run supabase/fix_grants_rls_backfill.sql in the Supabase SQL editor.",
    };
  }

  const have = new Set((existing ?? []).map((row) => row.task_id as string));
  const missing = allTasks.filter((task) => !have.has(task.id));

  if (missing.length === 0) {
    return { created: 0 };
  }

  console.log(
    `🔧 Creating ${missing.length} missing user_tasks for ${userId}…`,
  );

  const rows = missing.map((task) => ({
    user_id: userId,
    task_id: task.id,
    status: "available",
  }));

  const { error: insertError } = await supabase
    .from("user_tasks")
    .insert(rows);

  if (insertError) {
    console.warn(
      "Error creating user tasks:",
      formatSupabaseError(insertError),
    );
    return { created: 0, error: formatSupabaseError(insertError) };
  }

  console.log(`✅ Created ${rows.length} tasks for user`);
  return { created: rows.length };
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

/**
 * Children: ensure own user_tasks.
 * Parents: do not create personal tasks — assign/backfill happens for children
 * (via child login or SQL). Returns child profile ids for parents.
 */
export async function ensureTasksForViewer(
  supabase: SupabaseClient,
  profile: {
    id: string;
    is_child: boolean;
    linked_children?: string[] | null;
  },
): Promise<{ created: number; error?: string; subjectUserIds: string[] }> {
  if (profile.is_child) {
    const result = await ensureUserTasks(supabase, profile.id);
    return {
      created: result.created,
      error: result.error,
      subjectUserIds: [profile.id],
    };
  }

  const childIds = await resolveLinkedChildIds(
    supabase,
    profile.linked_children,
  );
  return { created: 0, subjectUserIds: childIds };
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
