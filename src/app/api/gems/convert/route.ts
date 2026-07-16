import { createClient } from "@/lib/supabase/server";
import {
  convertibleExp,
  displayGems,
  EXP_PER_GEM,
  gemsFromConvertedExp,
} from "@/lib/scoring";
import {
  resolveSelectedChildId,
} from "@/lib/user-tasks";
import { NextResponse } from "next/server";

async function sumSubjectExp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  subjectId: string,
): Promise<{ totalExp: number; taskGems: number }> {
  const [{ data: sessions }, { data: userTasks }, { data: tasks }] =
    await Promise.all([
      supabase
        .from("sessions")
        .select("exp_earned")
        .eq("user_id", subjectId)
        .not("ended_at", "is", null),
      supabase
        .from("user_tasks")
        .select("task_id, status")
        .eq("user_id", subjectId)
        .eq("status", "claimed"),
      supabase.from("tasks").select("id, exp, gem"),
    ]);

  const sessionExp = (sessions ?? []).reduce(
    (sum, row) => sum + Number(row.exp_earned ?? 0),
    0,
  );

  const byId = new Map(
    (tasks ?? []).map((t) => [t.id as string, t] as const),
  );

  let taskExp = 0;
  let taskGems = 0;
  for (const ut of userTasks ?? []) {
    const task = byId.get(ut.task_id as string);
    if (!task) continue;
    taskExp += Number(task.exp ?? 0);
    taskGems += Number(task.gem ?? 0);
  }

  return { totalExp: sessionExp + taskExp, taskGems };
}

/** Convert all available multiples of 20 EXP into gems on the dashboard subject. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: viewer, error: viewerError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (viewerError || !viewer) {
    return NextResponse.json(
      { error: viewerError?.message || "Profile not found" },
      { status: viewerError ? 500 : 404 },
    );
  }

  let subjectId = user.id;
  if (!viewer.is_child) {
    const childId = await resolveSelectedChildId(supabase, viewer);
    if (!childId) {
      return NextResponse.json(
        { error: "No mentee selected to convert gems for" },
        { status: 400 },
      );
    }
    subjectId = childId;
  }

  const { data: subject, error: subjectError } = await supabase
    .from("profiles")
    .select("id, converted_exp, invitation_code")
    .eq("id", subjectId)
    .maybeSingle();

  if (subjectError || !subject) {
    return NextResponse.json(
      { error: subjectError?.message || "Subject profile not found" },
      { status: subjectError ? 500 : 404 },
    );
  }

  const { totalExp, taskGems } = await sumSubjectExp(supabase, subjectId);
  const convertedExp = Number(subject.converted_exp ?? 0);
  const available = totalExp - convertedExp;
  const amount = convertibleExp(available);

  if (amount < EXP_PER_GEM) {
    return NextResponse.json(
      { error: "Need at least 20 EXP to convert", convertible: 0 },
      { status: 400 },
    );
  }

  const nextConverted = convertedExp + amount;

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ converted_exp: nextConverted })
    .eq("id", subjectId)
    .select("converted_exp")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const stored = Number(updated.converted_exp ?? nextConverted);

  return NextResponse.json({
    ok: true,
    converted_exp: stored,
    converted_this_time: amount,
    gems_gained: gemsFromConvertedExp(amount),
    gems: displayGems(taskGems, stored),
    available_exp: Math.max(0, totalExp - stored),
  });
}
