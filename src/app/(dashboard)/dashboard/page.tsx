import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { hasNickname } from "@/lib/auth";
import { toUtcIso } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import {
  ensureTasksForViewer,
  fetchViewerUserTasks,
} from "@/lib/user-tasks";
import type { ActiveSessionState, Profile } from "@/types";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!hasNickname(profile?.nickname)) redirect("/setup");

  const typedProfile = profile as Profile;
  const ensureResult = await ensureTasksForViewer(supabase, typedProfile);

  const serverNow = new Date().toISOString();
  const subjectIds =
    ensureResult.subjectUserIds.length > 0
      ? ensureResult.subjectUserIds
      : typedProfile.is_child
        ? [user.id]
        : [];

  const [
    { data: tasks, error: tasksError },
    { data: userTasks },
    { data: milestones, error: milestonesError },
    { data: openSession },
    { data: sessions },
  ] = await Promise.all([
    supabase.from("tasks").select("*").order("task_no"),
    fetchViewerUserTasks(supabase, subjectIds),
    supabase.from("milestones").select("*").order("gem_threshold"),
    supabase
      .from("sessions")
      .select("*")
      .eq("user_id", user.id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("sessions")
      .select("exp_earned")
      .eq("user_id", user.id)
      .not("ended_at", "is", null),
  ]);

  const active: ActiveSessionState | null = openSession
    ? {
        sessionId: openSession.id,
        startedAt: toUtcIso(openSession.started_at),
        serverNow,
        isTutorial: Boolean(openSession.is_tutorial),
      }
    : null;

  const sessionExp = (sessions ?? []).reduce(
    (sum, s) => sum + Number(s.exp_earned ?? 0),
    0,
  );

  const catalogEmpty = !tasksError && (tasks?.length ?? 0) === 0;
  const tasksWarning =
    ensureResult.error ||
    tasksError?.message ||
    milestonesError?.message ||
    (catalogEmpty
      ? "Task catalog is blocked or empty. Run supabase/fix_grants_rls_backfill.sql in Supabase."
      : undefined);

  return (
    <DashboardClient
      profile={typedProfile}
      tasks={tasks ?? []}
      userTasks={userTasks ?? []}
      milestones={milestones ?? []}
      initialActive={active}
      sessionExp={sessionExp}
      tasksWarning={tasksWarning}
    />
  );
}
