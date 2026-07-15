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

const SESSION_TOGGLE_FADE_MS = 500;
/** Compact session log row height (h-[58px]). */
const SESSION_CARD_H = 58;
/** Matches space-y-3 (0.75rem) between finished cards. */
const FINISHED_GAP_PX = 12;
const SESSION_SLOT_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const SECTION_ANIM_MS = 500;
const SECTION_ANIM_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function CollapsibleSection({
  title,
  count,
  defaultOpen = true,
  children,
  empty,
  emptyMessage = "Nothing here yet.",
  headerEnd,
  contentClassName = "space-y-3",
}: {
  title: string;
  /** Item count shown as TITLE (n). */
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
  empty?: boolean;
  emptyMessage?: string;
  /** Rendered left of the chevron (e.g. sessions toggle). */
  headerEnd?: ReactNode;
  contentClassName?: string;
}) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const [slotsOpen, setSlotsOpen] = useState(defaultOpen);
  const [opaque, setOpaque] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const id of timers.current) window.clearTimeout(id);
    };
  }, []);

  function clearTimers() {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }

  function after(ms: number, fn: () => void) {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }

  function toggle() {
    if (busy.current) return;
    busy.current = true;
    clearTimers();

    if (expanded) {
      // Fade out, then collapse space.
      setExpanded(false);
      setOpaque(false);
      after(SECTION_ANIM_MS, () => {
        setSlotsOpen(false);
        after(SECTION_ANIM_MS, () => {
          setMounted(false);
          busy.current = false;
        });
      });
      return;
    }

    // Reserve space, then fade in.
    setExpanded(true);
    setMounted(true);
    setOpaque(false);
    setSlotsOpen(false);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setSlotsOpen(true);
        after(SECTION_ANIM_MS, () => {
          setOpaque(true);
          after(SECTION_ANIM_MS, () => {
            busy.current = false;
          });
        });
      });
    });
  }

  return (
    <section>
      <div className="mb-3 flex w-full items-center gap-2 px-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center text-left"
          aria-expanded={expanded}
          onClick={toggle}
        >
          <h2 className="text-[11px] font-semibold uppercase tracking-[1.76px] text-[#8a7a68]">
            {title}
            {typeof count === "number" ? ` (${count})` : null}
          </h2>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          {headerEnd}
          <button
            type="button"
            className="shrink-0"
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
            onClick={toggle}
          >
            <ChevronDownIcon
              size={14}
              className={`text-[#8a7a68] transition-transform duration-500 ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>
      </div>
      {mounted ? (
        <div
          className="grid"
          style={{
            gridTemplateRows: slotsOpen ? "1fr" : "0fr",
            transition: `grid-template-rows ${SECTION_ANIM_MS}ms ${SECTION_ANIM_EASE}`,
          }}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              style={{
                opacity: opaque ? 1 : 0,
                transition: `opacity ${SECTION_ANIM_MS}ms ease`,
              }}
            >
              {empty ? (
                <p className="rounded-2xl bg-[rgba(240,232,216,0.5)] px-4 py-5 text-center text-sm text-[#8a7a68]">
                  {emptyMessage}
                </p>
              ) : (
                <div className={contentClassName}>{children}</div>
              )}
            </div>
          </div>
        </div>
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
  /** Sessions shown in Finished by default.
   * Hide: fade out all → collapse slots (tasks fill).
   * Show: reopen slots → fade back in. */
  const [showSessions, setShowSessions] = useState(true);
  const [renderSessions, setRenderSessions] = useState(true);
  const [sessionsOpaque, setSessionsOpaque] = useState(true);
  const [sessionsSlotsOpen, setSessionsSlotsOpen] = useState(true);
  const sessionToggleBusy = useRef(false);
  const sessionToggleTimers = useRef<number[]>([]);
  const prevStatusRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    return () => {
      for (const id of sessionToggleTimers.current) window.clearTimeout(id);
    };
  }, []);

  function clearSessionToggleTimers() {
    for (const id of sessionToggleTimers.current) window.clearTimeout(id);
    sessionToggleTimers.current = [];
  }

  function afterSessionToggle(ms: number, fn: () => void) {
    const id = window.setTimeout(fn, ms);
    sessionToggleTimers.current.push(id);
  }

  function toggleShowSessions() {
    if (sessionToggleBusy.current) return;
    sessionToggleBusy.current = true;
    clearSessionToggleTimers();

    if (showSessions) {
      setShowSessions(false);
      setSessionsOpaque(false);
      afterSessionToggle(SESSION_TOGGLE_FADE_MS, () => {
        setSessionsSlotsOpen(false);
        afterSessionToggle(SESSION_TOGGLE_FADE_MS, () => {
          setRenderSessions(false);
          sessionToggleBusy.current = false;
        });
      });
      return;
    }

    setShowSessions(true);
    setRenderSessions(true);
    setSessionsOpaque(false);
    setSessionsSlotsOpen(false);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setSessionsSlotsOpen(true);
        afterSessionToggle(SESSION_TOGGLE_FADE_MS, () => {
          setSessionsOpaque(true);
          afterSessionToggle(SESSION_TOGGLE_FADE_MS, () => {
            sessionToggleBusy.current = false;
          });
        });
      });
    });
  }

  const tasks = useMemo(() => enrichTasks(rawTasks), [rawTasks]);
  const { byTaskId, claimedNos, yourTasks, lockedTasks, finished } =
    partitionTasks(tasks, userTasks, sessionLogs, celebratingIds);

  const finishedVisible = renderSessions
    ? finished
    : finished.filter((entry) => entry.kind === "task");
  const hasSessionLogs = finished.some((entry) => entry.kind === "session");

  const investedSeconds = finished.reduce((sum, entry) => {
    if (entry.kind !== "session") return sum;
    const d = entry.session.duration_seconds;
    return sum + (typeof d === "number" && d > 0 ? d : 0);
  }, 0);
  const investedHours = Math.floor(investedSeconds / 3600);
  const investedMinutes = Math.floor((investedSeconds % 3600) / 60);
  const investedLabel = `🌱 ${investedHours}h ${investedMinutes}m invested in yourself`;

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
        count={yourTasks.length}
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
        count={lockedTasks.length}
        defaultOpen={false}
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
        count={finished.length}
        empty={finishedVisible.length === 0}
        emptyMessage="Choose a task to start from!"
        contentClassName="flex flex-col"
        headerEnd={
          hasSessionLogs ? (
            <button
              type="button"
              className="rounded-full bg-[rgba(200,146,42,0.18)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold"
              aria-pressed={showSessions}
              onClick={toggleShowSessions}
            >
              {showSessions ? "Hide Sessions" : "Show Sessions"}
            </button>
          ) : null
        }
      >
        {finishedVisible.map((entry, index) => {
          // Gap only before a later item that still occupies space (open sessions
          // or any task) so collapse/expand includes the 12px between cards.
          let trailingGap = 0;
          for (let j = index + 1; j < finishedVisible.length; j++) {
            const next = finishedVisible[j];
            if (next.kind === "task") {
              trailingGap = FINISHED_GAP_PX;
              break;
            }
            if (sessionsSlotsOpen) {
              trailingGap = FINISHED_GAP_PX;
              break;
            }
          }

          if (entry.kind === "session") {
            return (
              <div
                key={`session-${entry.session.id}`}
                className="overflow-hidden"
                style={{
                  maxHeight: sessionsSlotsOpen ? SESSION_CARD_H : 0,
                  marginBottom: sessionsSlotsOpen ? trailingGap : 0,
                  opacity: sessionsOpaque ? 1 : 0,
                  transition: `max-height ${SESSION_TOGGLE_FADE_MS}ms ${SESSION_SLOT_EASE}, margin-bottom ${SESSION_TOGGLE_FADE_MS}ms ${SESSION_SLOT_EASE}, opacity ${SESSION_TOGGLE_FADE_MS}ms ease`,
                }}
              >
                <TaskCard
                  variant="log"
                  logTitle={
                    entry.session.is_tutorial
                      ? "Tutorial Session"
                      : "Working Session"
                  }
                  logExp={entry.session.exp_earned}
                  logGem={0}
                  completedAt={entry.session.ended_at}
                  logDurationSeconds={entry.session.duration_seconds}
                  logSignedBy={entry.session.conductor_nickname}
                  logLocationConsistent={entry.session.location_consistent}
                />
              </div>
            );
          }
          return (
            <div
              key={entry.task.id}
              className={
                enteringFinishedIds.has(entry.task.id)
                  ? "opacity-0 [animation:milestone-finished-in_1s_ease_forwards]"
                  : undefined
              }
              style={{
                marginBottom: trailingGap,
                transition: `margin-bottom ${SESSION_TOGGLE_FADE_MS}ms ${SESSION_SLOT_EASE}`,
              }}
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
          );
        })}
      </CollapsibleSection>

      <p className="px-1 text-center text-[11px] font-semibold tracking-[1.76px] text-[#8a7a68]">
        {investedLabel}
      </p>
    </div>
  );
}
