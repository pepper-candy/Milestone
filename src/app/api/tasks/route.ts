import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  sampleTemplateEntries,
  sharedFieldsFromCatalogEntry,
} from "@/lib/import-sample-template";
import { seedSystemPrizePathIfEmpty } from "@/lib/prize-path";
import {
  ensureTasksForViewer,
  fetchViewerUserTasks,
  resolveLinkedChildIds,
} from "@/lib/user-tasks";
import type { Profile } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type TaskWritePatch = {
  task_no?: string;
  category?: string;
  exp?: number;
  gem?: number;
  title?: string | null;
  description?: string | null;
  requires_proof?: boolean;
  icon_key?: string | null;
  detail_title?: string | null;
  detail_lead?: string | null;
  detail_aim?: string | null;
  detail_body?: string | null;
  prereq_1?: string | null;
  prereq_2?: string | null;
  prereqs?: string[] | null;
  seed_catalog?: boolean;
};

const EXTENDED_TASK_COLUMNS = [
  "icon_key",
  "detail_title",
  "detail_lead",
  "detail_aim",
  "detail_body",
  "is_catalog_template",
  "prereqs",
] as const;

function tasksWriteClient(supabase: SupabaseClient): {
  client: SupabaseClient;
  viaAdmin: boolean;
} {
  try {
    return { client: createAdminClient(), viaAdmin: true };
  } catch (err) {
    console.warn(
      "[tasks write] admin client unavailable, using user session:",
      err instanceof Error ? err.message : err,
    );
    return { client: supabase, viaAdmin: false };
  }
}

function isMissingColumnError(message: string): boolean {
  return /column .* does not exist/i.test(message);
}

function isSchemaCacheColumnError(message: string, code?: string): boolean {
  return (
    code === "PGRST204" ||
    /could not find the .* column of .* in the schema cache/i.test(message)
  );
}

function isRetriableColumnError(message: string, code?: string): boolean {
  return isMissingColumnError(message) || isSchemaCacheColumnError(message, code);
}

function buildTaskUpdateRow(patch: TaskWritePatch): Record<string, unknown> {
  return {
    ...(patch.task_no !== undefined ? { task_no: patch.task_no } : {}),
    ...(patch.category !== undefined ? { category: patch.category } : {}),
    ...(patch.exp !== undefined ? { exp: patch.exp } : {}),
    ...(patch.gem !== undefined ? { gem: patch.gem } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined
      ? { description: patch.description }
      : {}),
    ...(patch.requires_proof !== undefined
      ? { requires_proof: patch.requires_proof }
      : {}),
    ...(patch.icon_key !== undefined ? { icon_key: patch.icon_key } : {}),
    ...(patch.detail_title !== undefined
      ? { detail_title: patch.detail_title }
      : {}),
    ...(patch.detail_lead !== undefined
      ? { detail_lead: patch.detail_lead }
      : {}),
    ...(patch.detail_aim !== undefined
      ? { detail_aim: patch.detail_aim }
      : {}),
    ...(patch.detail_body !== undefined
      ? { detail_body: patch.detail_body }
      : {}),
    ...(patch.prereq_1 !== undefined ? { prereq_1: patch.prereq_1 } : {}),
    ...(patch.prereq_2 !== undefined ? { prereq_2: patch.prereq_2 } : {}),
    ...(patch.prereqs !== undefined ? { prereqs: patch.prereqs } : {}),
    ...(patch.seed_catalog === true ? { is_catalog_template: true } : {}),
    ...(patch.seed_catalog === false ? { is_catalog_template: false } : {}),
  };
}

function stripExtendedTaskColumns(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...row };
  for (const key of EXTENDED_TASK_COLUMNS) {
    delete next[key];
  }
  return next;
}

function permissionDeniedHint(message: string, viaAdmin: boolean): string {
  if (!/permission denied|42501/i.test(message)) return "";
  if (viaAdmin) {
    return (
      " Service-role was denied — run supabase/fix_tasks_service_role_grants.sql" +
      " in the Supabase SQL Editor (GRANT on tasks/user_tasks for service_role)."
    );
  }
  return (
    " Your session cannot write tasks. Run supabase/fix_tasks_service_role_grants.sql" +
    " (or fix_tasks_update_permission.sql) in the Supabase SQL Editor," +
    " and/or set SUPABASE_SERVICE_ROLE_KEY in .env.local."
  );
}

async function writeTaskUpdate(
  supabase: SupabaseClient,
  taskId: string,
  patch: TaskWritePatch,
) {
  const { client, viaAdmin } = tasksWriteClient(supabase);
  const full = buildTaskUpdateRow(patch);
  const fallback = stripExtendedTaskColumns(full);
  const attempts = [
    full,
    ...(Object.keys(fallback).length > 0 ? [fallback] : []),
  ];

  let lastError: { message: string; code?: string } | null = null;

  for (const row of attempts) {
    const result = await client
      .from("tasks")
      .update(row)
      .eq("id", taskId)
      .select("*")
      .maybeSingle();

    if (!result.error && result.data) {
      return result;
    }

    if (result.error) {
      lastError = result.error;
      if (!isRetriableColumnError(result.error.message, result.error.code)) {
        break;
      }
      continue;
    }

    lastError = {
      message: "Task not found or update not permitted",
      code: "TASK_UPDATE_EMPTY",
    };
    break;
  }

  if (lastError) {
    console.error(
      "[tasks update]",
      lastError.code,
      lastError.message,
      viaAdmin ? "(admin)" : "(user session)",
    );
    lastError = {
      ...lastError,
      message: `${lastError.message}${permissionDeniedHint(lastError.message, viaAdmin)}`,
    };
  }

  return { data: null, error: lastError };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const lookup = searchParams.get("lookup")?.trim();
  if (lookup) {
    // Prefer shared catalog templates so mentee instances never collide on lookup.
    const { data: match, error: lookupError } = await supabase
      .from("tasks")
      .select("*")
      .ilike("task_no", lookup)
      .eq("is_catalog_template", true)
      .maybeSingle();
    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }
    return NextResponse.json({ task: match });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const typedProfile = (profile ?? {
    id: user.id,
    is_child: true,
    linked_children: [],
  }) as Profile;

  const ensureResult = await ensureTasksForViewer(supabase, typedProfile);
  const subjectIds =
    ensureResult.subjectUserIds.length > 0
      ? ensureResult.subjectUserIds
      : typedProfile.is_child
        ? [user.id]
        : [];

  const category = searchParams.get("category");

  let query = supabase.from("tasks").select("*").order("seq");
  if (category) query = query.eq("category", category);

  const { data: tasks, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: userTasks } = await fetchViewerUserTasks(supabase, subjectIds);

  return NextResponse.json({
    tasks: tasks ?? [],
    userTasks: userTasks ?? [],
    profile: typedProfile,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    action:
      | "complete"
      | "approve"
      | "claim"
      | "dismiss"
      | "undo"
      | "create"
      | "update"
      | "delete"
      | "remove"
      | "import_template";
    task_id?: string;
    user_task_id?: string;
    child_user_id?: string;
    proof_data?: Record<string, unknown>;
    task?: {
      task_no?: string;
      category?: string;
      exp?: number;
      gem?: number;
      title?: string | null;
      description?: string | null;
      requires_proof?: boolean;
      icon_key?: string | null;
      detail_title?: string | null;
      detail_lead?: string | null;
      detail_aim?: string | null;
      detail_body?: string | null;
      prereq_1?: string | null;
      prereq_2?: string | null;
      prereqs?: string[] | null;
      seed_catalog?: boolean;
    };
  };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const isChild = profile?.is_child ?? true;
  const nickname = (profile?.nickname as string | null) ?? null;

  if (body.action === "complete") {
    if (!isChild) {
      return NextResponse.json(
        { error: "Parents approve tasks; children mark them complete" },
        { status: 403 },
      );
    }
    if (!body.task_id) {
      return NextResponse.json({ error: "task_id required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("user_tasks")
      .upsert(
        {
          user_id: user.id,
          task_id: body.task_id,
          status: "pending",
          completed_at: new Date().toISOString(),
          proof_data: body.proof_data ?? null,
        },
        { onConflict: "user_id,task_id" },
      )
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ userTask: data });
  }

  if (body.action === "approve") {
    if (isChild) {
      return NextResponse.json({ error: "Only parents can approve" }, { status: 403 });
    }
    if (!body.user_task_id) {
      return NextResponse.json({ error: "user_task_id required" }, { status: 400 });
    }

    const linkedChildIds = await resolveLinkedChildIds(
      supabase,
      profile?.linked_children,
    );

    const { data: existing, error: existingError } = await supabase
      .from("user_tasks")
      .select("id, user_id, status")
      .eq("id", body.user_task_id)
      .maybeSingle();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: existingError?.message || "Task not found" },
        { status: existingError ? 500 : 404 },
      );
    }

    if (!linkedChildIds.includes(existing.user_id as string)) {
      return NextResponse.json(
        { error: "Task does not belong to a linked child" },
        { status: 403 },
      );
    }

    // PASS → verified; child must CLAIM to finish.
    const { data, error } = await supabase
      .from("user_tasks")
      .update({
        status: "verified",
        marked_by_user_id: user.id,
        marked_by_nickname: nickname,
      })
      .eq("id", body.user_task_id)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ userTask: data });
  }

  if (body.action === "claim") {
    if (!body.user_task_id) {
      return NextResponse.json({ error: "user_task_id required" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("user_tasks")
      .update({
        status: "claimed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", body.user_task_id)
      .eq("user_id", user.id)
      .eq("status", "verified")
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ userTask: data });
  }

  if (body.action === "dismiss") {
    if (!isChild) {
      return NextResponse.json(
        { error: "Only children can dismiss pending tasks" },
        { status: 403 },
      );
    }
    if (!body.user_task_id) {
      return NextResponse.json({ error: "user_task_id required" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("user_tasks")
      .update({ status: "available", completed_at: null })
      .eq("id", body.user_task_id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ userTask: data });
  }

  if (body.action === "undo") {
    if (isChild) {
      return NextResponse.json(
        { error: "Only parents can undo finished tasks" },
        { status: 403 },
      );
    }
    if (!body.user_task_id) {
      return NextResponse.json({ error: "user_task_id required" }, { status: 400 });
    }

    const linkedChildIds = await resolveLinkedChildIds(
      supabase,
      profile?.linked_children,
    );

    const { data: existing, error: existingError } = await supabase
      .from("user_tasks")
      .select("id, user_id, status")
      .eq("id", body.user_task_id)
      .maybeSingle();

    if (existingError || !existing) {
      return NextResponse.json(
        { error: existingError?.message || "Task not found" },
        { status: existingError ? 500 : 404 },
      );
    }

    if (!linkedChildIds.includes(existing.user_id as string)) {
      return NextResponse.json(
        { error: "Task does not belong to a linked child" },
        { status: 403 },
      );
    }

    if (existing.status !== "claimed" && existing.status !== "verified") {
      return NextResponse.json(
        { error: "Only passed or finished tasks can be undone" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("user_tasks")
      .update({
        status: "available",
        completed_at: null,
        marked_by_user_id: null,
        marked_by_nickname: null,
      })
      .eq("id", body.user_task_id)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ userTask: data });
  }

  if (
    body.action === "create" ||
    body.action === "update" ||
    body.action === "delete" ||
    body.action === "remove" ||
    body.action === "import_template"
  ) {
    if (isChild) {
      return NextResponse.json(
        { error: "Only parents can manage tasks" },
        { status: 403 },
      );
    }
  }

  if (body.action === "import_template") {
    const childUserId = body.child_user_id;
    if (!childUserId) {
      return NextResponse.json(
        { error: "child_user_id required" },
        { status: 400 },
      );
    }

    const linkedChildIds = await resolveLinkedChildIds(
      supabase,
      profile?.linked_children,
    );
    if (!linkedChildIds.includes(childUserId)) {
      return NextResponse.json(
        { error: "Task does not belong to a linked child" },
        { status: 403 },
      );
    }

    const { data: existingAssignments, error: existingError } = await supabase
      .from("user_tasks")
      .select("id, status")
      .eq("user_id", childUserId)
      .neq("status", "removed");

    if (existingError) {
      return NextResponse.json(
        { error: existingError.message },
        { status: 500 },
      );
    }

    if ((existingAssignments ?? []).length > 0) {
      return NextResponse.json(
        {
          error:
            "This mentee already has tasks. Import is only available when Your Tasks is empty.",
        },
        { status: 409 },
      );
    }

    const { client: writeClient, viaAdmin } = tasksWriteClient(supabase);
    const entries = sampleTemplateEntries();
    let createdCount = 0;
    let catalogSeeded = 0;

    for (const entry of entries) {
      const sharedFields = sharedFieldsFromCatalogEntry(entry);

      const { data: existingTemplate } = await writeClient
        .from("tasks")
        .select("id")
        .ilike("task_no", entry.task_no)
        .eq("is_catalog_template", true)
        .maybeSingle();

      if (!existingTemplate) {
        const { error: seedError } = await writeClient.from("tasks").insert({
          ...sharedFields,
          is_catalog_template: true,
        });
        if (seedError) {
          console.warn(
            "[import_template] catalog seed skipped:",
            entry.task_no,
            seedError.message,
          );
        } else {
          catalogSeeded += 1;
        }
      }

      const { data: instance, error: instanceError } = await writeClient
        .from("tasks")
        .insert({ ...sharedFields, is_catalog_template: false })
        .select("id")
        .single();

      if (instanceError || !instance) {
        const uniqueHint =
          instanceError?.code === "23505" ||
          /duplicate key|unique constraint/i.test(instanceError?.message ?? "")
            ? " Run supabase/migrate_mentee_task_instances.sql so mentee instances can share a task_no."
            : "";
        return NextResponse.json(
          {
            error: `${instanceError?.message || "Could not create task instance"}${uniqueHint}${permissionDeniedHint(instanceError?.message ?? "", viaAdmin)}`,
          },
          { status: 500 },
        );
      }

      const { error: assignError } = await writeClient.from("user_tasks").insert({
        user_id: childUserId,
        task_id: instance.id,
        status: "available",
      });

      if (assignError) {
        const parentHint =
          /permission denied|42501/i.test(assignError.message) && !viaAdmin
            ? " Run supabase/fix_parent_create_task.sql so parents can assign tasks, and/or set SUPABASE_SERVICE_ROLE_KEY."
            : permissionDeniedHint(assignError.message, viaAdmin);
        return NextResponse.json(
          { error: `${assignError.message}${parentHint}` },
          { status: 500 },
        );
      }

      createdCount += 1;
    }

    // Also seed the system prize template when this mentee's path is empty.
    const prizeSeed = await seedSystemPrizePathIfEmpty(writeClient, childUserId);
    if (prizeSeed.error) {
      console.warn(
        "[import_template] prize path seed skipped:",
        prizeSeed.error,
      );
    }

    return NextResponse.json({
      ok: true,
      created: createdCount,
      catalogSeeded,
      prizesSeeded: prizeSeed.seeded,
    });
  }

  if (body.action === "create" && body.task) {
    const childUserId = body.child_user_id;
    if (!childUserId) {
      return NextResponse.json(
        { error: "child_user_id required" },
        { status: 400 },
      );
    }

    const linkedChildIds = await resolveLinkedChildIds(
      supabase,
      profile?.linked_children,
    );
    if (!linkedChildIds.includes(childUserId)) {
      return NextResponse.json(
        { error: "Task does not belong to a linked child" },
        { status: 403 },
      );
    }

    const patch = body.task;
    const taskNo = String(patch.task_no ?? "").trim();
    if (!taskNo) {
      return NextResponse.json({ error: "task_no required" }, { status: 400 });
    }

    const { data: catalogTemplate, error: catalogError } = await supabase
      .from("tasks")
      .select("id")
      .ilike("task_no", taskNo)
      .eq("is_catalog_template", true)
      .maybeSingle();

    if (catalogError) {
      return NextResponse.json({ error: catalogError.message }, { status: 500 });
    }

    let seedCatalog = patch.seed_catalog;
    if (seedCatalog === undefined) {
      seedCatalog = !catalogTemplate;
    }

    const { client: writeClient, viaAdmin } = tasksWriteClient(supabase);
    const sharedFields = {
      task_no: taskNo,
      category:
        patch.category?.trim() ||
        patch.detail_title?.trim() ||
        taskNo,
      title: patch.detail_title?.trim() || patch.category?.trim() || null,
      description: patch.description ?? null,
      exp: patch.exp ?? 0,
      gem: patch.gem ?? 0,
      requires_proof: patch.requires_proof ?? false,
      icon_key: patch.icon_key?.trim() || "target",
      detail_title: patch.detail_title ?? null,
      detail_lead: patch.detail_lead ?? null,
      detail_aim: patch.detail_aim ?? null,
      detail_body: patch.detail_body ?? null,
      prereq_1: patch.prereq_1 ?? null,
      prereq_2: patch.prereq_2 ?? null,
      prereqs: patch.prereqs ?? null,
      seq: null,
    };

    // Mentee always gets a dedicated instance (never the shared catalog row).
    const { data: created, error: createError } = await writeClient
      .from("tasks")
      .insert({ ...sharedFields, is_catalog_template: false })
      .select("*")
      .single();

    if (createError) {
      console.error("[tasks create] insert instance failed:", createError);
      const uniqueHint =
        createError.code === "23505" ||
        /duplicate key|unique constraint/i.test(createError.message)
          ? " Run supabase/migrate_mentee_task_instances.sql (drop global tasks_task_no_key; keep catalog partial unique) so mentee instances can share a task_no."
          : "";
      return NextResponse.json(
        {
          error: `${createError.message}${uniqueHint}${permissionDeniedHint(createError.message, viaAdmin)}`,
        },
        { status: 500 },
      );
    }

    // Optionally seed a separate shared catalog template for others to load.
    if (seedCatalog && !catalogTemplate) {
      const { error: seedError } = await writeClient.from("tasks").insert({
        ...sharedFields,
        is_catalog_template: true,
      });
      if (seedError) {
        const uniqueSeed =
          seedError.code === "23505" ||
          /duplicate key|unique constraint/i.test(seedError.message);
        console.warn(
          "[tasks create] catalog seed skipped:",
          seedError.message,
          uniqueSeed ? "(template already exists)" : "",
        );
      }
    }

    // Assign to mentee (admin client bypasses user_tasks RLS that only allows self-insert).
    const { data: userTask, error: assignError } = await writeClient
      .from("user_tasks")
      .insert({
        user_id: childUserId,
        task_id: created.id,
        status: "available",
      })
      .select("*")
      .single();

    if (assignError) {
      console.error("[tasks create] assign mentee failed:", assignError);
      const parentHint =
        /permission denied|42501/i.test(assignError.message) && !viaAdmin
          ? " Run supabase/fix_parent_create_task.sql so parents can assign tasks, and/or set SUPABASE_SERVICE_ROLE_KEY."
          : permissionDeniedHint(assignError.message, viaAdmin);
      return NextResponse.json(
        {
          error: `${assignError.message}${parentHint}`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ task: created, userTask });
  }

  if (body.action === "update" && body.task_id && body.task) {
    const { data, error } = await writeTaskUpdate(
      supabase,
      body.task_id,
      body.task,
    );
    if (error) {
      const hint = isSchemaCacheColumnError(error.message, error.code)
        ? " Supabase schema cache is stale — run NOTIFY pgrst, 'reload schema'; in the SQL editor, or reload the API schema in project settings."
        : "";
      return NextResponse.json(
        { error: `${error.message}${hint}` },
        { status: 500 },
      );
    }
    return NextResponse.json({ task: data });
  }

  if (body.action === "remove") {
    const linkedChildIds = await resolveLinkedChildIds(
      supabase,
      profile?.linked_children,
    );

    let existing: {
      id: string;
      user_id: string;
      task_id: string;
      status: string;
    } | null = null;

    if (body.user_task_id) {
      const { data, error } = await supabase
        .from("user_tasks")
        .select("id, user_id, task_id, status")
        .eq("id", body.user_task_id)
        .maybeSingle();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      existing = data;
    } else if (body.task_id && body.child_user_id) {
      const { data, error } = await supabase
        .from("user_tasks")
        .select("id, user_id, task_id, status")
        .eq("task_id", body.task_id)
        .eq("user_id", body.child_user_id)
        .maybeSingle();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      existing = data;
    } else if (body.task_id) {
      // Prefer a linked child's assignment for this catalog task.
      if (linkedChildIds.length === 0) {
        return NextResponse.json(
          { error: "No linked mentee to remove task for" },
          { status: 400 },
        );
      }
      const { data, error } = await supabase
        .from("user_tasks")
        .select("id, user_id, task_id, status")
        .eq("task_id", body.task_id)
        .in("user_id", linkedChildIds)
        .limit(1)
        .maybeSingle();
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      existing = data;
    } else {
      return NextResponse.json(
        { error: "user_task_id or task_id required" },
        { status: 400 },
      );
    }

    if (!existing) {
      return NextResponse.json({ error: "Task assignment not found" }, { status: 404 });
    }

    if (!linkedChildIds.includes(existing.user_id)) {
      return NextResponse.json(
        { error: "Task does not belong to a linked child" },
        { status: 403 },
      );
    }

    const { data, error } = await supabase
      .from("user_tasks")
      .update({ status: "removed" })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ userTask: data });
  }

  if (body.action === "delete" && body.task_id) {
    const { error } = await supabase.from("tasks").delete().eq("id", body.task_id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
