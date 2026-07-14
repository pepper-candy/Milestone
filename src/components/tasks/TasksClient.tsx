"use client";

import { TaskList } from "@/components/tasks/TaskList";
import type { Profile, SessionLogItem, Task, UserTask } from "@/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  profile: Profile | null;
  tasks: Task[];
  userTasks: UserTask[];
  sessionLogs?: SessionLogItem[];
};

export function TasksClient({
  profile,
  tasks,
  userTasks: initialUserTasks,
  sessionLogs = [],
}: Props) {
  const router = useRouter();
  const [userTasks, setUserTasks] = useState(initialUserTasks);

  async function refresh() {
    const res = await fetch("/api/tasks");
    if (!res.ok) return;
    const data = (await res.json()) as { userTasks: UserTask[] };
    setUserTasks(data.userTasks ?? []);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-ink">All Tasks</h1>
      <p className="text-sm text-text-muted">
        Mark complete, wait for approval, then claim rewards.
      </p>
      <TaskList
        tasks={tasks}
        userTasks={userTasks}
        isChild={profile?.is_child ?? true}
        sessionLogs={sessionLogs}
        onChanged={refresh}
      />
    </div>
  );
}
