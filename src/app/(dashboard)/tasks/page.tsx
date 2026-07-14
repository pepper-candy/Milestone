import { TasksClient } from "@/components/tasks/TasksClient";
import { createClient } from "@/lib/supabase/server";
import { ensureUserTasks } from "@/lib/user-tasks";
import { redirect } from "next/navigation";

export default async function TasksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await ensureUserTasks(supabase, user.id);

  const [{ data: profile }, { data: tasks }, { data: userTasks }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("tasks").select("*").order("task_no"),
      supabase.from("user_tasks").select("*").eq("user_id", user.id),
    ]);

  return (
    <TasksClient
      profile={profile}
      tasks={tasks ?? []}
      userTasks={userTasks ?? []}
    />
  );
}
