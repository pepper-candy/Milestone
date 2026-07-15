import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ensureTasksForViewer,
  fetchViewerUserTasks,
  resolveLinkedChildIds,
} from "@/lib/user-tasks";
import type { Profile } from "@/types";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const { searchParams } = new URL(request.url);
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
      | "delete";
    task_id?: string;
    user_task_id?: string;
    child_user_id?: string;
    proof_data?: Record<string, unknown>;
    task?: {
      task_no: string;
      category: string;
      exp: number;
      gem: number;
      title?: string;
      description?: string;
      requires_proof?: boolean;
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

  if (body.action === "create" || body.action === "update" || body.action === "delete") {
    if (isChild) {
      return NextResponse.json(
        { error: "Only parents can manage tasks" },
        { status: 403 },
      );
    }
  }

  if (body.action === "create" && body.task) {
    const { data, error } = await supabase
      .from("tasks")
      .insert(body.task)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ task: data });
  }

  if (body.action === "update" && body.task_id && body.task) {
    const { data, error } = await supabase
      .from("tasks")
      .update(body.task)
      .eq("id", body.task_id)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ task: data });
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
