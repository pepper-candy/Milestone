"use client";

import {
  TaskCard,
  CELEBRATE_FADE_MS,
  type TaskCardAction,
} from "@/components/tasks/TaskCard";
import { ChevronDownIcon } from "@/components/ui/Icons";
import { notifyFamilySync } from "@/lib/family-sync";
import { enrichTasks } from "@/lib/task-catalog";
import type { SessionLogItem, Task, UserTask } from "@/types";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

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
        className="mb-3 flex w-full items-center justify-between gap-2 px-1"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <h2 className="text-[11px] font-semibold uppercase tracking-[1.76px] text-[#8a7a68]">
          {title}
        </h2>
        <ChevronDownIcon
          size={14}
          className={`shrink-0 text-[#8a7a68] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? (
        empty ? (
          <p className="rounded-2xl bg-[rgba(240,232,216,0.5)] px-4 py-5 text-center text-sm text-[#8a7a68]">
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

function unmetPrereqHints(task: Task, claimedNos: Set<string>): string[] {
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
  celebratingIds: Set<string>,
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

    // Keep celebrating claimed cards in Your Tasks until the 5s ritual ends.
    if (ut?.status === "claimed" && celebratingIds.has(task.id)) {
      yourTasks.push(task);
      continue;
    }

    if (ut?.status === "claimed") {
      finishedTasks.push({
        kind: "task",
        sortAt: ut.completed_at ? new Date(ut.completed_at).getTime() : 0,
        task,
        userTask: ut,
      });
      continue;
    }

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
  const [celebratingIds, setCelebratingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsingIds, setCollapsingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [enteringFinishedIds, setEnteringFinishedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const prevStatusRef = useRef<Map<string, string>>(new Map());

  const tasks = useMemo(() => enrichTasks(rawTasks), [rawTasks]);
  const { byTaskId, claimedNos, yourTasks, lockedTasks, finished } =
    partitionTasks(tasks, userTasks, sessionLogs, celebratingIds);

  const startCelebration = useCallback((taskId: string) => {
    setCelebratingIds((prev) => {
      if (prev.has(taskId)) return prev;
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });
  }, []);

  // Detect newly claimed tasks (local PASS / claim or family-sync refresh).
  useEffect(() => {
    const prev = prevStatusRef.current;
    for (const ut of userTasks) {
      const before = prev.get(ut.task_id);
      if (ut.status === "claimed" && before && before !== "claimed") {
        startCelebration(ut.task_id);
      }
    }
    const next = new Map<string, string>();
    for (const ut of userTasks) next.set(ut.task_id, ut.status);
    prevStatusRef.current = next;
  }, [userTasks, startCelebration]);

  function finishCelebration(taskId: string) {
    setCelebratingIds((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
    setCollapsingIds((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
    setEnteringFinishedIds((prev) => {
      const next = new Set(prev);
      next.add(taskId);
      return next;
    });
    window.setTimeout(() => {
      setEnteringFinishedIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
    }, CELEBRATE_FADE_MS);
  }

  async function handleAction(task: Task, action: TaskCardAction) {
    setBusyId(task.id);
    try {
      const userTask = byTaskId.get(task.id);
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
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
      // CLAIM moves to Finished + celebration (PASS only verifies).
      if (action === "claim") {
        startCelebration(task.id);
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
      <CollapsibleSection
        title="Your Tasks"
        empty={yourTasks.length === 0}
      >
        {yourTasks.map((task) => {
          const celebrating = celebratingIds.has(task.id);
          const collapsing = collapsingIds.has(task.id);
          return (
            <div
              key={task.id}
              className="overflow-hidden"
              style={{
                maxHeight: collapsing ? 0 : 480,
                opacity: collapsing ? 0 : 1,
                transition: collapsing
                  ? `max-height ${CELEBRATE_FADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${CELEBRATE_FADE_MS}ms ease`
                  : undefined,
              }}
            >
              <TaskCard
                task={task}
                userTask={byTaskId.get(task.id)}
                isChild={isChild}
                busy={busyId === task.id}
                celebrate={celebrating}
                onCelebrateFadeStart={() =>
                  setCollapsingIds((prev) => {
                    const next = new Set(prev);
                    next.add(task.id);
                    return next;
                  })
                }
                onCelebrateDone={() => finishCelebration(task.id)}
                onAction={(action) => void handleAction(task, action)}
              />
            </div>
          );
        })}
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
          ) : (
            <div
              key={entry.task.id}
              className={
                enteringFinishedIds.has(entry.task.id)
                  ? "opacity-0 [animation:milestone-finished-in_1s_ease_forwards]"
                  : undefined
              }
            >
              {!isChild ? (
                <TaskCard
                  task={entry.task}
                  userTask={entry.userTask}
                  isChild={false}
                  busy={busyId === entry.task.id}
                  onAction={(action) => void handleAction(entry.task, action)}
                />
              ) : (
                <TaskCard
                  variant="log"
                  task={entry.task}
                  logTitle={
                    entry.task.category ||
                    entry.task.title ||
                    entry.task.task_no
                  }
                  logExp={entry.task.exp}
                  logGem={entry.task.gem}
                  completedAt={entry.userTask.completed_at}
                />
              )}
            </div>
          ),
        )}
      </CollapsibleSection>
    </div>
  );
}
