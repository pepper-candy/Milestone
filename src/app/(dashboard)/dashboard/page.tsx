import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { hasNickname } from "@/lib/auth";
import { getDailyQuote } from "@/lib/daily-quote";
import { toUtcIso } from "@/lib/datetime";
import { menteeRowsToMilestones } from "@/lib/prize-path";
import { createClient } from "@/lib/supabase/server";
import { enrichTasks } from "@/lib/task-catalog";
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

  // Parents need at least one linked mentee before using the dashboard.
  if (
    !typedProfile.is_child &&
    !(typedProfile.linked_children ?? []).filter(Boolean).length
  ) {
    redirect("/remember-codes");
  }

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
          .select(
            "id, ended_at, exp_earned, is_tutorial, duration_seconds, conductor_nickname, location_consistent",
          )
          .in("user_id", subjectIds)
          .not("ended_at", "is", null)
          .order("ended_at", { ascending: false })
      : Promise.resolve({ data: [] as SessionLogItem[], error: null });

  /** Same subject as API: primary child (or child self). */
  const sessionSubjectId = subjectIds[0] ?? null;

  const openSessionQuery = sessionSubjectId
    ? supabase
        .from("sessions")
        .select("*")
        .eq("user_id", sessionSubjectId)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [
    { data: tasks, error: tasksError },
    { data: userTasks },
    { data: menteeMilestoneRows, error: milestonesError },
    { data: openSession },
    { data: endedSessions },
    { data: subjectProfile },
  ] = await Promise.all([
    supabase.from("tasks").select("*").order("seq"),
    fetchViewerUserTasks(supabase, subjectIds),
    sessionSubjectId
      ? supabase
          .from("mentee_milestones")
          .select("*")
          .eq("user_id", sessionSubjectId)
          .order("gem_threshold")
      : Promise.resolve({ data: [], error: null }),
    openSessionQuery,
    sessionsQuery,
    sessionSubjectId
      ? supabase
          .from("profiles")
          .select("nickname, invitation_code")
          .eq("id", sessionSubjectId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const milestones = menteeRowsToMilestones(menteeMilestoneRows ?? []);

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
    duration_seconds:
      s.duration_seconds == null ? null : Number(s.duration_seconds),
    conductor_nickname: (s.conductor_nickname as string | null) ?? null,
    location_consistent:
      s.location_consistent == null ? null : Boolean(s.location_consistent),
  }));

  const sessionExp = sessionLogs.reduce((sum, s) => sum + s.exp_earned, 0);

  const catalogEmpty = !tasksError && (tasks?.length ?? 0) === 0;
  const milestonesHint =
    milestonesError?.message &&
    /mentee_milestones|does not exist|schema cache/i.test(milestonesError.message)
      ? " Prize paths need ref/supabase/migrate_mentee_prize_paths.sql in Supabase."
      : milestonesError?.message
        ? ` ${milestonesError.message}`
        : "";
  const tasksWarning =
    ensureResult.error ||
    tasksError?.message ||
    (milestonesHint ? milestonesHint.trim() : undefined) ||
    (catalogEmpty
      ? "Task catalog is blocked or empty. Run supabase/fix_grants_rls_backfill.sql in Supabase."
      : undefined);
  const dailyQuote = getDailyQuote();
  const subjectNickname =
    !typedProfile.is_child
      ? ((subjectProfile?.nickname as string | null) ?? null)
      : null;
  const subjectInviteCode =
    !typedProfile.is_child
      ? ((subjectProfile?.invitation_code as string | null) ?? null)
      : null;

  return (
    <DashboardClient
      profile={typedProfile}
      tasks={enrichTasks(tasks ?? [])}
      userTasks={userTasks ?? []}
      milestones={milestones}
      initialActive={active}
      sessionExp={sessionExp}
      sessionLogs={sessionLogs}
      subjectIds={subjectIds}
      subjectNickname={subjectNickname}
      subjectInviteCode={subjectInviteCode}
      tasksWarning={tasksWarning}
      dailyQuote={dailyQuote}
    />
  );
}
