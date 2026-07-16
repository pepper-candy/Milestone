"use client";

import { MilestonePath } from "@/components/progress/MilestonePath";
import { TaskList } from "@/components/tasks/TaskList";
import { SessionTimer } from "@/components/timer/SessionTimer";
import { BoltIcon, GemIcon } from "@/components/ui/Icons";
import { subscribeFamilySync, type FamilySyncPart } from "@/lib/family-sync";
import { totalEffectiveGems } from "@/lib/scoring";
import type {
  ActiveSessionState,
  DailyQuote,
  Milestone,
  Profile,
  SessionLogItem,
  Task,
  UserTask,
} from "@/types";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Props = {
  profile: Profile;
  tasks: Task[];
  userTasks: UserTask[];
  milestones: Milestone[];
  initialActive: ActiveSessionState | null;
  sessionExp: number;
  sessionLogs?: SessionLogItem[];
  tasksWarning?: string;
  /** Child profile UUID(s) this dashboard watches (own id for child; linked kids for parent). */
  subjectIds?: string[];
  dailyQuote: DailyQuote;
};

const COLLAPSE_THRESHOLD = 40;
/** Closed header ≈ profile row + drag handle (matches collapsed parent layout). */
const HEADER_COLLAPSED_EST = 72;
/** Open header ≈ profile + progress + handle. */
const HEADER_EXPANDED_EST = 170;
const CONTENT_GAP = 12;
const SPIN_ITEMS = ["+1 Gem", "+2 Gem", "XP x2", "Lucky", "+0.5 Gem"];
const SPIN_ITEM_WIDTH = 70;
const SPIN_TRACK_LENGTH = 60;

export function DashboardClient({
  profile,
  tasks,
  userTasks: initialUserTasks,
  milestones,
  initialActive,
  sessionExp,
  sessionLogs = [],
  tasksWarning,
  subjectIds = [],
  dailyQuote,
}: Props) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [userTasks, setUserTasks] = useState(initialUserTasks);
  const [logs, setLogs] = useState(sessionLogs);
  const [liveSessionExp, setLiveSessionExp] = useState(sessionExp);
  /** false = progress open; true = progress tucked away. Parents start collapsed. */
  const [progressCollapsed, setProgressCollapsed] = useState(!profile.is_child);
  /** Extra height while dragging (negative = collapsing). */
  const [dragDelta, setDragDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [progressNaturalHeight, setProgressNaturalHeight] = useState(96);
  const [headerHeight, setHeaderHeight] = useState(
    !profile.is_child ? HEADER_COLLAPSED_EST : HEADER_EXPANDED_EST,
  );
  const [headerMeasured, setHeaderMeasured] = useState(false);
  const [spinPos, setSpinPos] = useState(20);
  const [spinning, setSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState("Ready");

  const dragging = useRef(false);
  const didDrag = useRef(false);
  const startY = useRef(0);
  const dragDeltaRef = useRef(0);
  const collapsedRef = useRef(progressCollapsed);
  const headerRef = useRef<HTMLElement>(null);
  const progressInnerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const claimed = userTasks.filter((ut) => ut.status === "claimed");
  const taskExp = claimed.reduce((sum, ut) => {
    const task = tasks.find((t) => t.id === ut.task_id);
    return sum + (task?.exp ?? 0);
  }, 0);
  const taskGems = claimed.reduce((sum, ut) => {
    const task = tasks.find((t) => t.id === ut.task_id);
    return sum + (task?.gem ?? 0);
  }, 0);
  const totalExp = taskExp + liveSessionExp;
  const gems = totalEffectiveGems(totalExp, taskGems);

  useEffect(() => {
    collapsedRef.current = progressCollapsed;
  }, [progressCollapsed]);

  // Prevent the browser from restoring a mid-list scroll under the fixed header.
  useEffect(() => {
    if (!("scrollRestoration" in history)) return;
    const prev = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = prev;
    };
  }, []);

  useEffect(() => {
    setUserTasks(initialUserTasks);
  }, [initialUserTasks]);

  useEffect(() => {
    setLogs(sessionLogs);
    setLiveSessionExp(sessionExp);
  }, [sessionLogs, sessionExp]);

  // Children: default expanded, auto-collapse after 10s. Parents stay collapsed.
  useEffect(() => {
    if (!profile.is_child) return;
    const id = window.setTimeout(() => setProgressCollapsed(true), 10_000);
    return () => window.clearTimeout(id);
  }, [profile.is_child]);

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

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const measure = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      if (h > 0) {
        setHeaderHeight(h);
        setHeaderMeasured(true);
      }
    };
    measure();
    // Second pass after paint settles (fonts / rounded shadow).
    const raf = window.requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      window.cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [progressCollapsed, dragDelta, progressNaturalHeight]);

  // Keep YOUR TASKS under the header on reload: re-pin while padding catches up
  // to the measured open/collapsed progress height.
  const bootPinning = useRef(true);
  useLayoutEffect(() => {
    if (!bootPinning.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    if (!headerMeasured) return;
    const raf = window.requestAnimationFrame(() => {
      if (!bootPinning.current || !scrollRef.current) return;
      scrollRef.current.scrollTop = 0;
      window.requestAnimationFrame(() => {
        if (!bootPinning.current || !scrollRef.current) return;
        scrollRef.current.scrollTop = 0;
        bootPinning.current = false;
      });
    });
    const late = window.setTimeout(() => {
      if (bootPinning.current && scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
      bootPinning.current = false;
    }, 320);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(late);
    };
  }, [headerMeasured, headerHeight]);
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

  async function refreshActiveSession() {
    try {
      const res = await fetch("/api/session");
      if (!res.ok) return;
      const data = (await res.json()) as {
        active: ActiveSessionState | null;
      };
      setActive(data.active);
    } catch {
      // ignore
    }
  }

  function spinDailyWheel() {
    if (spinning) return;
    setSpinning(true);
    const step = 8 + Math.floor(Math.random() * SPIN_ITEMS.length);
    const nextPos = spinPos + step;
    setSpinPos(nextPos);
    window.setTimeout(() => {
      setSpinResult(SPIN_ITEMS[nextPos % SPIN_ITEMS.length] ?? "Ready");
      setSpinning(false);
    }, 1150);
  }

  /** Background refresh after a family-sync ping (other device / linked user). */
  async function refreshFromFamilyPing(part: FamilySyncPart) {
    if (part === "tasks" || part === "dashboard") {
      await refreshTasks();
    }
    if (part === "sessions" || part === "dashboard") {
      await refreshActiveSession();
      // session logs / EXP come from the server page
      router.refresh();
    }
  }

  useEffect(() => {
    if (subjectIds.length === 0) return;
    return subscribeFamilySync(subjectIds, (payload) => {
      void refreshFromFamilyPing(payload.part);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable subject set; refresh uses latest closures via router/state
  }, [subjectIds.join("|")]);

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
  /** Compact only when fully tucked — keep pb while progress is dragging open. */
  const profileCompact = openHeight < 1;

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
        <div
          className={`flex items-center justify-between px-4 pt-3 ${
            profileCompact ? "pb-0" : "pb-2"
          }`}
        >
          <button
            type="button"
            onClick={() => router.push("/profile")}
            className="flex min-w-0 items-center gap-3 rounded-2xl text-left transition active:opacity-80"
            aria-label="Open profile"
          >
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
          </button>

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
            <div className="mt-2 rounded-2xl border border-[rgba(200,146,42,0.16)] bg-[rgba(255,250,242,0.92)] px-3 py-2.5 shadow-[inset_0px_1px_4px_0px_rgba(0,0,0,0.03)]">
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[rgba(28,22,16,0.55)]">
                      Daily Quote
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-[16px] text-ink">
                      "{dailyQuote.quote}"
                    </p>
                    <p className="mt-0.5 text-[10px] text-[rgba(28,22,16,0.55)]">
                      - {dailyQuote.author}
                    </p>
                  </div>

                  <div className="shrink-0 rounded-[16px] border border-[rgba(123,104,238,0.3)] bg-[rgba(201,184,232,0.28)] px-3 py-2 text-center text-[#7b68ee]">
                    <p className="text-[13px] font-semibold leading-4">Daily Spin</p>
                    <p className="text-[10px] opacity-80">{spinning ? "Spinning..." : spinResult}</p>
                  </div>
                </div>

                <div className="mt-2.5 rounded-xl border border-[rgba(123,104,238,0.2)] bg-[rgba(255,255,255,0.65)] px-2 py-2">
                  <div className="relative mx-auto w-[210px] overflow-hidden">
                    <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-px -translate-x-1/2 bg-[rgba(123,104,238,0.5)]" />
                    <div
                      className="flex"
                      style={{
                        transform: `translateX(${(1 - spinPos) * SPIN_ITEM_WIDTH}px)`,
                        transition: spinning
                          ? "transform 1.1s cubic-bezier(0.16, 1, 0.3, 1)"
                          : "transform 0.2s ease-out",
                      }}
                    >
                      {Array.from({ length: SPIN_TRACK_LENGTH }, (_, i) => (
                        <div
                          key={i}
                          className="flex h-8 w-[70px] shrink-0 items-center justify-center px-1"
                        >
                          <span className="rounded-full border border-[rgba(123,104,238,0.22)] bg-[rgba(201,184,232,0.2)] px-2 py-0.5 text-[10px] font-semibold text-[#6d57e4]">
                            {SPIN_ITEMS[i % SPIN_ITEMS.length]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={spinDailyWheel}
                    disabled={spinning}
                    className="mt-2.5 flex w-full items-center justify-center rounded-full border border-[rgba(123,104,238,0.3)] bg-[rgba(201,184,232,0.28)] px-3 py-1.5 text-[11px] font-semibold text-[#6d57e4] disabled:opacity-60"
                    aria-label="Spin daily wheel"
                  >
                    {spinning ? "Spinning..." : "Spin now"}
                  </button>
                </div>
              </div>
            </div>
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
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 pb-44"
        style={{
          paddingTop: headerHeight + CONTENT_GAP,
          // Avoid animating the first measure — that pulled content under the handle.
          transition:
            !headerMeasured || isDragging
              ? "none"
              : "padding-top 0.38s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {tasksWarning ? (
          <p className="mb-3 rounded-2xl bg-[rgba(200,146,42,0.12)] px-4 py-3 text-center text-sm text-[#8a7a68]">
            {tasksWarning}
          </p>
        ) : null}

        <TaskList
          tasks={tasks}
          userTasks={userTasks}
          isChild={profile.is_child}
          sessionLogs={logs}
          onChanged={refreshTasks}
        />
      </div>

      <SessionTimer
        isChild={profile.is_child}
        active={active}
        onActiveChange={setActive}
        subjectIds={subjectIds}
      />
    </div>
  );
}
