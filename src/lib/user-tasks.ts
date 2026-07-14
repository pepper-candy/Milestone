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
 * Backfill user_tasks for accounts created before the assign-on-signup trigger.
 * Safe to call on every dashboard/tasks load — only inserts missing rows.
 */
export async function ensureUserTasks(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ created: number; error?: string }> {
  // Prefer a normal SELECT over count/head — Prefer:count headers fail in some
  // PostgREST/RLS setups and serialize as empty {} in the Next error overlay.
  const { data: existing, error: existingError } = await supabase
    .from("user_tasks")
    .select("task_id")
    .eq("user_id", userId);

  if (existingError) {
    console.warn(
      "Error checking user tasks:",
      formatSupabaseError(existingError),
    );
    return { created: 0, error: existingError.message };
  }

  const { data: allTasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id");

  if (tasksError || !allTasks) {
    console.warn(
      "Error fetching tasks:",
      tasksError ? formatSupabaseError(tasksError) : "no data",
    );
    return {
      created: 0,
      error: tasksError?.message ?? "Could not load tasks catalog",
    };
  }

  if (allTasks.length === 0) {
    console.warn("⚠️ tasks table is empty — nothing to assign");
    return { created: 0 };
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
    status: "pending",
  }));

  const { error: insertError } = await supabase
    .from("user_tasks")
    .insert(rows);

  if (insertError) {
    console.warn(
      "Error creating user tasks:",
      formatSupabaseError(insertError),
    );
    return { created: 0, error: insertError.message };
  }

  console.log(`✅ Created ${rows.length} tasks for user`);
  return { created: rows.length };
}
