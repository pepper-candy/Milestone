"use client";

import { TaskCard } from "@/components/tasks/TaskCard";
import type { Task, UserTask } from "@/types";
import { useState } from "react";

const CATEGORY_LABELS: Record<string, string> = {
  math_s23: "Math S2–S3",
  math_s4: "Math S4",
  eng_writing: "English Writing",
  eng_vocab: "English Vocab",
  eng_speaking: "English Speaking",
  community: "Community",
};

type TaskListProps = {
  tasks: Task[];
  userTasks: UserTask[];
  isChild: boolean;
  limit?: number;
  flat?: boolean;
  onChanged?: () => void;
};

export function TaskList({
  tasks,
  userTasks,
  isChild,
  limit,
  flat = false,
  onChanged,
}: TaskListProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const byTaskId = new Map(userTasks.map((ut) => [ut.task_id, ut]));

  const visible = limit ? tasks.slice(0, limit) : tasks;

  async function handleAction(
    task: Task,
    action: "complete" | "approve" | "claim",
  ) {
    setBusyId(task.id);
    try {
      const userTask = byTaskId.get(task.id);
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          task_id: task.id,
          user_task_id: userTask?.id,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        alert(data.error || "Action failed");
        return;
      }
      onChanged?.();
    } finally {
      setBusyId(null);
    }
  }

  if (flat) {
    return (
      <div className="space-y-3">
        {visible.map((task) => (
          <div
            key={task.id}
            className={busyId === task.id ? "opacity-60" : undefined}
          >
            <TaskCard
              task={task}
              userTask={byTaskId.get(task.id)}
              isChild={isChild}
              onAction={(action) => void handleAction(task, action)}
            />
          </div>
        ))}
        {visible.length === 0 ? (
          <p className="rounded-2xl bg-warm-bg px-4 py-6 text-center text-sm text-text-muted">
            No tasks yet.
          </p>
        ) : null}
      </div>
    );
  }

  const grouped = visible.reduce<Record<string, Task[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([category, list]) => (
        <section key={category}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#8a7a68]">
            {CATEGORY_LABELS[category] ?? category}
          </h3>
          <div className="space-y-3">
            {list.map((task) => (
              <div
                key={task.id}
                className={busyId === task.id ? "opacity-60" : undefined}
              >
                <TaskCard
                  task={task}
                  userTask={byTaskId.get(task.id)}
                  isChild={isChild}
                  onAction={(action) => void handleAction(task, action)}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
      {visible.length === 0 ? (
        <p className="rounded-2xl bg-warm-bg px-4 py-6 text-center text-sm text-text-muted">
          No tasks yet. Seed the tasks table from{" "}
          <code className="text-xs">supabase/seed.sql</code>.
        </p>
      ) : null}
    </div>
  );
}
