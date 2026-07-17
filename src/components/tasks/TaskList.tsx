"use client";

import {
  TaskCard,
  CELEBRATE_FADE_MS,
  createBlankTask,
  type TaskCardAction,
  type TaskSavePayload,
} from "@/components/tasks/TaskCard";
import { ChevronDownIcon } from "@/components/ui/Icons";
import { notifyFamilySync } from "@/lib/family-sync";
import { enrichTasks } from "@/lib/task-catalog";
import {
  buildKnownTaskNos,
  buildPrereqCompletionStats,
  isTaskUnlocked,
  unmetPrereqHints,
} from "@/lib/task-prerequisites";
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
  /** Mentee user id when parent is viewing a linked child. */
  subjectUserId?: string | null;
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
const ADD_BUTTON_H = 38;
/** Edit-card clip height while the shell expands. */
const ADD_CARD_H = 280;
/** How long to fade inner content before collapsing height back down. */
const CLOSE_CONTENT_FADE_BEFORE_COLLAPSE_MS = 220;
/** Fade the button text back in after collapse. */
const BUTTON_FADE_IN_MS = 200;

const ADD_SHELL_CLASS =
  "overflow-hidden rounded-2xl border border-[rgba(200,146,42,0.22)] bg-[rgba(255,250,242,0.95)] shadow-[0px_2px_8px_0px_rgba(200,146,42,0.08)]";

type AddTaskPhase = "idle" | "expand" | "revealed";

function AddNewTaskBlock({
  busy,
  onCreate,
  onActiveChange,
}: {
  busy: boolean;
  onCreate: (
    patch: TaskSavePayload,
  ) => boolean | void | Promise<boolean | void>;
  onActiveChange?: (active: boolean) => void;
}) {
  const [phase, setPhase] = useState<AddTaskPhase>("idle");
  const [expandOpen, setExpandOpen] = useState(false);
  const [labelVisible, setLabelVisible] = useState(true);
  const [contentRevealed, setContentRevealed] = useState(false);
  const [sidebarRevealed, setSidebarRevealed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [buttonOpacity, setButtonOpacity] = useState(1);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const id of timers.current) window.clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    onActiveChange?.(phase !== "idle");
  }, [phase, onActiveChange]);

  function clearTimers() {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }

  function after(ms: number, fn: () => void) {
    timers.current.push(window.setTimeout(fn, ms));
  }

  function close() {
    clearTimers();
    setClosing(true);
    setPhase("expand");
    setExpandOpen(true);
    setLabelVisible(false);
    setContentRevealed(false);
    setSidebarRevealed(false);
    setButtonOpacity(0);

    after(CLOSE_CONTENT_FADE_BEFORE_COLLAPSE_MS, () => {
      setExpandOpen(false);
    });

    after(
      CLOSE_CONTENT_FADE_BEFORE_COLLAPSE_MS + SECTION_ANIM_MS,
      () => {
        setPhase("idle");
        setClosing(false);
        setButtonOpacity(0);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setButtonOpacity(1));
        });
      },
    );
  }

  function open() {
    if (phase !== "idle") return;
    setClosing(false);
    setPhase("expand");
    setExpandOpen(false);
    setLabelVisible(true);
    setContentRevealed(false);
    setSidebarRevealed(false);
    setButtonOpacity(0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setLabelVisible(false);
        setExpandOpen(true);
      });
    });
    after(SECTION_ANIM_MS, () => {
      setPhase("revealed");
      setContentRevealed(true);
      setSidebarRevealed(true);
    });
  }

  async function handleCreate(patch: TaskSavePayload) {
    const ok = await onCreate(patch);
    if (ok !== false) close();
    return ok;
  }

  const opening = phase !== "idle";

  return (
    <div className={`px-1 ${opening ? "pb-3" : ""}`}>
      <div
        className={`${ADD_SHELL_CLASS} overflow-hidden`}
        style={{
          maxHeight: expandOpen ? ADD_CARD_H : ADD_BUTTON_H,
          transition:
            opening || expandOpen
              ? `max-height ${SECTION_ANIM_MS}ms ${SECTION_ANIM_EASE}`
              : undefined,
        }}
      >
        <div className="relative">
          {opening ? (
            <TaskCard
              task={createBlankTask()}
              isChild={false}
              creating
              creatingEmbedded
              createContentRevealed={contentRevealed}
              createSidebarRevealed={sidebarRevealed}
              busy={busy}
              onCreate={(patch) => handleCreate(patch)}
              onCancelCreate={close}
            />
          ) : null}

          {phase === "idle" ? (
            <button
              type="button"
              aria-label="Add new task"
              onClick={open}
              className="flex w-full items-center justify-center px-4 py-2.5 transition hover:bg-[rgba(252,221,166,0.28)] active:brightness-95"
              style={{
                height: ADD_BUTTON_H,
                opacity: buttonOpacity,
                transition: `opacity ${BUTTON_FADE_IN_MS}ms ease`,
              }}
            >
              <span className="text-[11px] font-semibold uppercase tracking-[1.4px] text-gold">
                Add New Task
              </span>
            </button>
          ) : phase === "expand" && !closing ? (
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center"
              style={{ height: ADD_BUTTON_H }}
              aria-hidden
            >
              <span
                className="text-[11px] font-semibold uppercase tracking-[1.4px] text-gold"
                style={{
                  opacity: labelVisible ? 1 : 0,
                  transition: `opacity ${SECTION_ANIM_MS}ms ease`,
                }}
              >
                Add New Task
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

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

function buildClaimedNos(tasks: Task[], userTasks: UserTask[]): Set<string> {
  const stats = buildPrereqCompletionStats(tasks, userTasks);
  const claimed = new Set<string>();
  for (const [no, row] of stats) {
    if (row.claimed > 0) claimed.add(no);
  }
  return claimed;
}

function partitionTasks(
  tasks: Task[],
  userTasks: UserTask[],
  sessionLogs: SessionLogItem[],
  celebratingIds: Set<string>,
  removingIds: Set<string>,
) {
  const byTaskId = new Map(userTasks.map((ut) => [ut.task_id, ut]));
  const assignedTasks = tasks.filter((task) => byTaskId.has(task.id));
  const prereqStats = buildPrereqCompletionStats(tasks, userTasks);
  const knownTaskNos = buildKnownTaskNos(assignedTasks);
  const claimedNos = buildClaimedNos(tasks, userTasks);

  const yourTasks: Task[] = [];
  const lockedTasks: Task[] = [];
  const finishedTasks: FinishedEntry[] = [];

  for (const task of assignedTasks) {
    const ut = byTaskId.get(task.id)!;
    // Hide mentee-removed assignments, except while the delete fade/collapse runs.
    if (ut?.status === "removed" && !removingIds.has(task.id)) continue;

    const unlocked = isTaskUnlocked(task, prereqStats, knownTaskNos);

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

    // Keep removing cards in their prior section until collapse finishes.
    if (ut?.status === "removed" && removingIds.has(task.id)) {
      if (unlocked) yourTasks.push(task);
      else lockedTasks.push(task);
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

  return {
    byTaskId,
    prereqStats,
    knownTaskNos,
    claimedNos,
    yourTasks,
    lockedTasks,
    finished,
  };
}

export function TaskList({
  tasks: rawTasks,
  userTasks,
  isChild,
  subjectUserId,
  sessionLogs = [],
  onChanged,
}: TaskListProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addComposerActive, setAddComposerActive] = useState(false);
  const [celebratingIds, setCelebratingIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [removingIds, setRemovingIds] = useState<Set<string>>(
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
  const { byTaskId, prereqStats, knownTaskNos, yourTasks, lockedTasks, finished } =
    partitionTasks(
      tasks,
      userTasks,
      sessionLogs,
      celebratingIds,
      removingIds,
    );

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

  function finishRemove(taskId: string) {
    setRemovingIds((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
    setCollapsingIds((prev) => {
      const next = new Set(prev);
      next.delete(taskId);
      return next;
    });
  }

  async function handleUpdate(task: Task, patch: TaskSavePayload) {
    setBusyId(task.id);
    try {
      const userTask = byTaskId.get(task.id);
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "update",
          task_id: task.id,
          user_task_id: userTask?.id,
          task: patch,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        alert(data.error || "Update failed");
        return false;
      }
      await onChanged?.();
      const childId = userTask?.user_id;
      if (childId) void notifyFamilySync(childId, "tasks");
      return true;
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(task: Task) {
    setBusyId(task.id);
    try {
      const userTask = byTaskId.get(task.id);
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "remove",
          task_id: task.id,
          user_task_id: userTask?.id,
          child_user_id: userTask?.user_id,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        alert(data.error || "Remove failed");
        return;
      }
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.add(task.id);
        return next;
      });
      setCollapsingIds((prev) => {
        const next = new Set(prev);
        next.add(task.id);
        return next;
      });
      await onChanged?.();
      const childId = userTask?.user_id;
      if (childId) void notifyFamilySync(childId, "tasks");
    } finally {
      setBusyId(null);
    }
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

  async function handleCreate(patch: TaskSavePayload) {
    const childId =
      subjectUserId ?? userTasks.find((ut) => ut.status !== "removed")?.user_id;
    if (!childId) {
      alert("No linked mentee selected.");
      return false;
    }
    setBusyId("__new__");
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "create",
          child_user_id: childId,
          task: patch,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        alert(data.error || "Create failed");
        return false;
      }
      await onChanged?.();
      void notifyFamilySync(childId, "tasks");
      return true;
    } finally {
      setBusyId(null);
    }
  }

  const addTaskBlock = !isChild ? (
    <AddNewTaskBlock
      busy={busyId === "__new__"}
      onCreate={(patch) => handleCreate(patch)}
      onActiveChange={setAddComposerActive}
    />
  ) : null;

  if (tasks.length === 0 && userTasks.length === 0) {
    return (
      <div className="space-y-4">
        {addTaskBlock}
        {!addComposerActive ? (
          <p className="rounded-2xl bg-warm-bg px-4 py-6 text-center text-sm text-text-muted">
            {isChild
              ? "No tasks yet."
              : "No tasks to show. If the catalog is empty, run supabase/fix_grants_rls_backfill.sql in Supabase."}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {addTaskBlock}
      <CollapsibleSection
        title="Your Tasks"
        count={yourTasks.length}
        empty={yourTasks.length === 0}
      >
        {yourTasks.map((task) => {
          const celebrating = celebratingIds.has(task.id);
          const collapsing = collapsingIds.has(task.id);
          const removing = removingIds.has(task.id);
          return (
            <div
              key={task.id}
              className="overflow-hidden"
              style={{
                maxHeight: collapsing ? 0 : 960,
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
                removing={removing}
                onCelebrateFadeStart={() =>
                  setCollapsingIds((prev) => {
                    const next = new Set(prev);
                    next.add(task.id);
                    return next;
                  })
                }
                onCelebrateDone={() => finishCelebration(task.id)}
                onRemoveDone={() => finishRemove(task.id)}
                onAction={(action) => void handleAction(task, action)}
                onUpdate={
                  isChild
                    ? undefined
                    : (patch) => handleUpdate(task, patch)
                }
                onRemove={
                  isChild ? undefined : () => handleRemove(task)
                }
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
        {lockedTasks.map((task) => {
          const collapsing = collapsingIds.has(task.id);
          const removing = removingIds.has(task.id);
          return (
            <div
              key={task.id}
              className="overflow-hidden"
              style={{
                maxHeight: collapsing ? 0 : 960,
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
                locked
                lockHints={unmetPrereqHints(task, prereqStats, knownTaskNos)}
                busy={busyId === task.id}
                removing={removing}
                onRemoveDone={() => finishRemove(task.id)}
                onUpdate={
                  isChild
                    ? undefined
                    : (patch) => handleUpdate(task, patch)
                }
                onRemove={
                  isChild ? undefined : () => handleRemove(task)
                }
              />
            </div>
          );
        })}
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
