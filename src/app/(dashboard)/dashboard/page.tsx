import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { hasNickname } from "@/lib/auth";
import { toUtcIso } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import {
  ensureTasksForViewer,
  fetchViewerUserTasks,
} from "@/lib/user-tasks";
import type { ActiveSessionState, Profile, SessionLogItem } from "@/types";
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

  const sessionsQuery =
    subjectIds.length > 0
      ? supabase
          .from("sessions")
          .select("id, ended_at, exp_earned, is_tutorial")
          .in("user_id", subjectIds)
          .not("ended_at", "is", null)
          .order("ended_at", { ascending: false })
      : Promise.resolve({ data: [] as SessionLogItem[], error: null });

  const [
    { data: tasks, error: tasksError },
    { data: userTasks },
    { data: milestones, error: milestonesError },
    { data: openAsOwner },
    { data: openAsConductor },
    { data: endedSessions },
  ] = await Promise.all([
    supabase.from("tasks").select("*").order("seq"),
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
      .select("*")
      .eq("conducted_by_user_id", user.id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sessionsQuery,
  ]);

  const openSession = openAsOwner ?? openAsConductor;

  const active: ActiveSessionState | null = openSession
    ? {
        sessionId: openSession.id,
        startedAt: toUtcIso(openSession.started_at),
        serverNow,
        isTutorial: Boolean(openSession.is_tutorial),
      }
    : null;

  const sessionLogs: SessionLogItem[] = (endedSessions ?? []).map((s) => ({
    id: s.id as string,
    ended_at: toUtcIso(s.ended_at as string),
    exp_earned: Number(s.exp_earned ?? 0),
    is_tutorial: Boolean(s.is_tutorial),
  }));

  const sessionExp = sessionLogs.reduce((sum, s) => sum + s.exp_earned, 0);

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
      sessionLogs={sessionLogs}
      subjectIds={subjectIds}
      tasksWarning={tasksWarning}
    />
  );
}
