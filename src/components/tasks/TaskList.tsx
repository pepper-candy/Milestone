"use client";

import { TaskCard, type TaskCardAction } from "@/components/tasks/TaskCard";
import { ChevronDownIcon } from "@/components/ui/Icons";
import { notifyFamilySync } from "@/lib/family-sync";
import { enrichTasks } from "@/lib/task-catalog";
import type { SessionLogItem, Task, UserTask } from "@/types";
import { useMemo, useState, type ReactNode } from "react";

type TaskListProps = {
  tasks: Task[];
  userTasks: UserTask[];
  isChild: boolean;
  sessionLogs?: SessionLogItem[];
  onChanged?: () => void | Promise<void>;
};

type FinishedEntry =
  | { kind: "task"; sortAt: number; task: Task; userTask: UserTask }
  | { kind: "session"; sortAt: number; session: SessionLogItem };

function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
  empty,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  empty?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-3 flex w-full items-center justify-between gap-2 px-1"
        aria-expanded={open}
      >
        <h3 className="text-xs font-semibold uppercase tracking-[1.68px] text-[#8a7a68]">
          {title}
        </h3>
        {/* Expanded → chevron up; collapsed → chevron down */}
        <ChevronDownIcon
          size={16}
          className={`shrink-0 text-[#8a7a68] transition-transform ${
            open ? "rotate-180" : "rotate-0"
          }`}
        />
      </button>
      {open ? (
        empty ? (
          <p className="rounded-2xl bg-warm-bg px-4 py-6 text-center text-sm text-text-muted">
            Nothing here yet.
          </p>
        ) : (
          <div className="space-y-3">{children}</div>
        )
      ) : null}
    </section>
  );
}

function seqOf(task: Task): number {
  return task.seq ?? Number.MAX_SAFE_INTEGER;
}

function normalizeNo(no: string | null | undefined): string {
  return (no ?? "").trim().toLowerCase();
}

/** Only claimed tasks fulfill prerequisites — pending/verified do not. */
function buildClaimedNos(tasks: Task[], userTasks: UserTask[]): Set<string> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const claimed = new Set<string>();
  for (const ut of userTasks) {
    if (ut.status !== "claimed") continue;
    const t = byId.get(ut.task_id);
    if (t) claimed.add(normalizeNo(t.task_no));
  }
  return claimed;
}

function isPrereqClaimed(
  prereq: string | null | undefined,
  claimedNos: Set<string>,
): boolean {
  if (!prereq || !normalizeNo(prereq)) return true;
  return claimedNos.has(normalizeNo(prereq));
}

function unmetPrereqHints(
  task: Task,
  claimedNos: Set<string>,
): string[] {
  const hints: string[] = [];
  for (const prereq of [task.prereq_1, task.prereq_2]) {
    if (!prereq || !normalizeNo(prereq)) continue;
    if (!isPrereqClaimed(prereq, claimedNos)) {
      hints.push(`Requires ${prereq}`);
    }
  }
  return hints;
}

function partitionTasks(
  tasks: Task[],
  userTasks: UserTask[],
  sessionLogs: SessionLogItem[],
) {
  const byTaskId = new Map(userTasks.map((ut) => [ut.task_id, ut]));
  const claimedNos = buildClaimedNos(tasks, userTasks);

  const yourTasks: Task[] = [];
  const lockedTasks: Task[] = [];
  const finishedTasks: FinishedEntry[] = [];

  for (const task of tasks) {
    const ut = byTaskId.get(task.id);
    const unlocked =
      isPrereqClaimed(task.prereq_1, claimedNos) &&
      isPrereqClaimed(task.prereq_2, claimedNos);

    // Claimed always goes to Finished (even if prereqs later change).
    if (ut?.status === "claimed") {
      finishedTasks.push({
        kind: "task",
        sortAt: ut.completed_at ? new Date(ut.completed_at).getTime() : 0,
        task,
        userTask: ut,
      });
      continue;
    }

    // Pending/verified/available still count as unfinished for unlock AND listing.
    if (!unlocked) {
      lockedTasks.push(task);
      continue;
    }

    yourTasks.push(task);
  }

  yourTasks.sort((a, b) => seqOf(a) - seqOf(b));
  lockedTasks.sort((a, b) => seqOf(a) - seqOf(b));

  const finished: FinishedEntry[] = [
    ...finishedTasks,
    ...sessionLogs.map((session) => ({
      kind: "session" as const,
      sortAt: session.ended_at ? new Date(session.ended_at).getTime() : 0,
      session,
    })),
  ].sort((a, b) => b.sortAt - a.sortAt);

  return { byTaskId, claimedNos, yourTasks, lockedTasks, finished };
}

export function TaskList({
  tasks: rawTasks,
  userTasks,
  isChild,
  sessionLogs = [],
  onChanged,
}: TaskListProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const tasks = useMemo(() => enrichTasks(rawTasks), [rawTasks]);
  const { byTaskId, claimedNos, yourTasks, lockedTasks, finished } =
    partitionTasks(tasks, userTasks, sessionLogs);

  async function handleAction(task: Task, action: TaskCardAction) {
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
      await onChanged?.();
      const childId = userTask?.user_id;
      if (childId) void notifyFamilySync(childId, "tasks");
    } finally {
      setBusyId(null);
    }
  }

  if (tasks.length === 0) {
    return (
      <p className="rounded-2xl bg-warm-bg px-4 py-6 text-center text-sm text-text-muted">
        {isChild
          ? "No tasks yet."
          : "No tasks to show. If the catalog is empty, run supabase/fix_grants_rls_backfill.sql in Supabase."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <CollapsibleSection title="Your Tasks" empty={yourTasks.length === 0}>
        {yourTasks.map((task) => (
          <div key={task.id}>
            <TaskCard
              task={task}
              userTask={byTaskId.get(task.id)}
              isChild={isChild}
              busy={busyId === task.id}
              onAction={(action) => void handleAction(task, action)}
            />
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection
        title="Locked Tasks"
        empty={lockedTasks.length === 0}
      >
        {lockedTasks.map((task) => (
          <div key={task.id}>
            <TaskCard
              task={task}
              userTask={byTaskId.get(task.id)}
              isChild={isChild}
              locked
              lockHints={unmetPrereqHints(task, claimedNos)}
            />
          </div>
        ))}
      </CollapsibleSection>

      <CollapsibleSection
        title="Finished Tasks"
        empty={finished.length === 0}
      >
        {finished.map((entry) =>
          entry.kind === "session" ? (
            <TaskCard
              key={`session-${entry.session.id}`}
              variant="log"
              logTitle={
                entry.session.is_tutorial
                  ? "Tutorial Session"
                  : "Working Session"
              }
              logExp={entry.session.exp_earned}
              logGem={0}
              completedAt={entry.session.ended_at}
            />
          ) : !isChild ? (
            <div key={entry.task.id}>
              <TaskCard
                task={entry.task}
                userTask={entry.userTask}
                isChild={false}
                busy={busyId === entry.task.id}
                onAction={(action) => void handleAction(entry.task, action)}
              />
            </div>
          ) : (
            <TaskCard
              key={entry.task.id}
              variant="log"
              task={entry.task}
              logTitle={
                entry.task.category || entry.task.title || entry.task.task_no
              }
              logExp={entry.task.exp}
              logGem={entry.task.gem}
              completedAt={entry.userTask.completed_at}
            />
          ),
        )}
      </CollapsibleSection>
    </div>
  );
}
