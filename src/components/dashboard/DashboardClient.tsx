"use client";

import { MilestonePath } from "@/components/progress/MilestonePath";
import { TaskList } from "@/components/tasks/TaskList";
import { SessionTimer } from "@/components/timer/SessionTimer";
import { BoltIcon, GemIcon } from "@/components/ui/Icons";
import { totalEffectiveGems } from "@/lib/scoring";
import type {
  ActiveSessionState,
  Milestone,
  Profile,
  Task,
  UserTask,
} from "@/types";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Props = {
  profile: Profile;
  tasks: Task[];
  userTasks: UserTask[];
  milestones: Milestone[];
  initialActive: ActiveSessionState | null;
  sessionExp: number;
  tasksWarning?: string;
};

const COLLAPSE_THRESHOLD = 40;

export function DashboardClient({
  profile,
  tasks,
  userTasks: initialUserTasks,
  milestones,
  initialActive,
  sessionExp,
  tasksWarning,
}: Props) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [userTasks, setUserTasks] = useState(initialUserTasks);
  /** false = progress open; true = progress tucked away */
  const [progressCollapsed, setProgressCollapsed] = useState(false);
  /** Extra height while dragging (negative = collapsing). */
  const [dragDelta, setDragDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [progressNaturalHeight, setProgressNaturalHeight] = useState(96);
  const [headerHeight, setHeaderHeight] = useState(88);

  const dragging = useRef(false);
  const didDrag = useRef(false);
  const startY = useRef(0);
  const dragDeltaRef = useRef(0);
  const collapsedRef = useRef(progressCollapsed);
  const headerRef = useRef<HTMLElement>(null);
  const progressInnerRef = useRef<HTMLDivElement>(null);

  const claimed = userTasks.filter((ut) => ut.status === "claimed");
  const taskExp = claimed.reduce((sum, ut) => {
    const task = tasks.find((t) => t.id === ut.task_id);
    return sum + (task?.exp ?? 0);
  }, 0);
  const taskGems = claimed.reduce((sum, ut) => {
    const task = tasks.find((t) => t.id === ut.task_id);
    return sum + (task?.gem ?? 0);
  }, 0);
  const totalExp = taskExp + sessionExp;
  const gems = totalEffectiveGems(totalExp, taskGems);

  useEffect(() => {
    collapsedRef.current = progressCollapsed;
  }, [progressCollapsed]);

  useEffect(() => {
    setUserTasks(initialUserTasks);
  }, [initialUserTasks]);

  // Default expanded; auto-collapse progress after 10s.
  useEffect(() => {
    const id = window.setTimeout(() => setProgressCollapsed(true), 10_000);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const inner = progressInnerRef.current;
    if (!inner) return;
    const measure = () =>
      setProgressNaturalHeight(inner.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [milestones, gems]);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => setHeaderHeight(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [progressCollapsed, dragDelta, progressNaturalHeight]);

  useEffect(() => {
    let cancelled = false;
    async function syncSession() {
      try {
        const res = await fetch("/api/session");
        if (!res.ok) return;
        const data = (await res.json()) as {
          active: ActiveSessionState | null;
        };
        if (!cancelled) setActive(data.active);
      } catch {
        // Keep SSR initialActive if sync fails.
      }
    }
    void syncSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshTasks() {
    const res = await fetch("/api/tasks");
    if (!res.ok) return;
    const data = (await res.json()) as { userTasks: UserTask[] };
    setUserTasks(data.userTasks ?? []);
    router.refresh();
  }

  function beginDrag(clientY: number) {
    dragging.current = true;
    didDrag.current = false;
    startY.current = clientY;
    dragDeltaRef.current = 0;
    setDragDelta(0);
    setIsDragging(true);
  }

  function moveDrag(clientY: number) {
    if (!dragging.current) return;
    const delta = clientY - startY.current;
    if (Math.abs(delta) > 6) didDrag.current = true;
    const max = progressNaturalHeight;
    // Finger tracks the progress panel 1:1; profile row never moves.
    const next = collapsedRef.current
      ? Math.max(0, Math.min(max, delta))
      : Math.min(0, Math.max(-max, delta));
    dragDeltaRef.current = next;
    setDragDelta(next);
  }

  function endDrag() {
    if (!dragging.current) return;
    dragging.current = false;
    setIsDragging(false);
    const offset = dragDeltaRef.current;
    if (collapsedRef.current) {
      if (offset >= COLLAPSE_THRESHOLD) setProgressCollapsed(false);
    } else if (offset <= -COLLAPSE_THRESHOLD) {
      setProgressCollapsed(true);
    }
    dragDeltaRef.current = 0;
    setDragDelta(0);
  }

  const openHeight = Math.max(
    0,
    (progressCollapsed ? 0 : progressNaturalHeight) + dragDelta,
  );
  const progressOpacity =
    progressNaturalHeight > 0
      ? Math.min(1, Math.max(0, openHeight / progressNaturalHeight))
      : progressCollapsed
        ? 0
        : 1;

  const sheetTransition = isDragging
    ? "none"
    : "height 0.38s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.38s cubic-bezier(0.22, 1, 0.36, 1)";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <header
        ref={headerRef}
        className="fixed inset-x-0 top-0 z-40 mx-auto w-full max-w-[475px] rounded-b-[24px] bg-[rgba(255,250,242,0.97)] shadow-[0px_4px_32px_0px_rgba(200,146,42,0.12)]"
      >
        {/* Always static — never translates with the swipe */}
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-surface p-0.5">
              <div className="relative size-full overflow-hidden rounded-full bg-cream">
                <Image
                  src={profile.avatar_url || "/brand/icon_app_d.png"}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="36px"
                  unoptimized={Boolean(profile.avatar_url)}
                />
              </div>
            </div>
            <p className="truncate text-sm font-semibold text-ink">
              {profile.nickname}
            </p>
          </div>

          <div
            className="flex shrink-0 items-center gap-3 rounded-full border border-[rgba(200,146,42,0.2)] bg-[rgba(252,221,166,0.4)] px-3.5 py-1.5"
            aria-label="Your EXP and gems"
          >
            <span className="flex items-center gap-1 text-xs font-semibold text-gold">
              <BoltIcon size={14} />
              {totalExp.toFixed(1)} EXP
            </span>
            <span className="h-3 w-px bg-[#fee685]" aria-hidden />
            <span className="flex items-center gap-1 text-xs font-semibold text-[#7b68ee]">
              <GemIcon size={14} />
              {gems.toFixed(1)} Gem
            </span>
          </div>
        </div>

        {/* Only this panel height + opacity follow the swipe */}
        <div
          className="overflow-hidden"
          style={{
            height: openHeight,
            opacity: progressOpacity,
            transition: sheetTransition,
          }}
        >
          <div ref={progressInnerRef} className="px-4 pb-2">
            <MilestonePath
              milestones={milestones}
              currentGems={gems}
              compact
            />
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-label={
            progressCollapsed
              ? "Drag down or tap to show progress"
              : "Drag up or tap to hide progress"
          }
          aria-expanded={!progressCollapsed}
          className="flex cursor-grab touch-none justify-center pb-3 pt-1 active:cursor-grabbing"
          onClick={() => {
            if (!didDrag.current) {
              setProgressCollapsed((v) => !v);
            }
            didDrag.current = false;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setProgressCollapsed((v) => !v);
            }
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            beginDrag(e.clientY);
          }}
          onPointerMove={(e) => moveDrag(e.clientY)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="h-1 w-8 rounded-full bg-[rgba(200,146,42,0.25)]" />
        </div>
      </header>

      <div
        className="flex-1 overflow-y-auto px-4 pb-44"
        style={{
          paddingTop: headerHeight + 12,
          transition: isDragging
            ? "none"
            : "padding-top 0.38s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-[1.68px] text-[#8a7a68]">
            {profile.is_child ? "Your Tasks" : "Tasks to review"}
          </h2>
        </div>

        {tasksWarning ? (
          <p className="mb-3 rounded-2xl bg-[rgba(200,146,42,0.12)] px-4 py-3 text-center text-sm text-[#8a7a68]">
            {tasksWarning}
          </p>
        ) : null}

        <TaskList
          tasks={tasks}
          userTasks={userTasks}
          isChild={profile.is_child}
          limit={7}
          flat
          onChanged={() => void refreshTasks()}
        />
      </div>

      <SessionTimer
        isChild={profile.is_child}
        active={active}
        onActiveChange={setActive}
      />
    </div>
  );
}
