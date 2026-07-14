import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { hasNickname } from "@/lib/auth";
import { toUtcIso } from "@/lib/datetime";
import { createClient } from "@/lib/supabase/server";
import { ensureUserTasks } from "@/lib/user-tasks";
import type { ActiveSessionState } from "@/types";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Existing users (pre-trigger) may have an empty user_tasks set — backfill once.
  const ensureResult = await ensureUserTasks(supabase, user.id);

  const serverNow = new Date().toISOString();

  const [
    { data: profile },
    { data: tasks },
    { data: userTasks },
    { data: milestones },
    { data: openSession },
    { data: sessions },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("tasks").select("*").order("task_no"),
    supabase.from("user_tasks").select("*").eq("user_id", user.id),
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

  if (!hasNickname(profile?.nickname)) redirect("/setup");

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

  return (
    <DashboardClient
      profile={profile}
      tasks={tasks ?? []}
      userTasks={userTasks ?? []}
      milestones={milestones ?? []}
      initialActive={active}
      sessionExp={sessionExp}
      tasksWarning={ensureResult.error}
    />
  );
}
