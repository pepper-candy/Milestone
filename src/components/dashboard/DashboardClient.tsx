"use client";

import { MilestonePath } from "@/components/progress/MilestonePath";
import { PrizePathEditor } from "@/components/progress/PrizePathEditor";
import { TaskList } from "@/components/tasks/TaskList";
import { SessionTimer } from "@/components/timer/SessionTimer";
import { BoltIcon, GemIcon, SpinnerIcon } from "@/components/ui/Icons";
import { subscribeFamilySync, type FamilySyncPart } from "@/lib/family-sync";
import { getRandomQuote } from "@/lib/daily-quote";
import { prefetchProfile } from "@/lib/profile-client-cache";
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
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  /** Selected mentee nickname when parent is viewing. */
  subjectNickname?: string | null;
  /** Selected mentee invite code — title fallback before nickname is set. */
  subjectInviteCode?: string | null;
  dailyQuote: DailyQuote;
};

const COLLAPSE_THRESHOLD = 40;
/** Closed header ≈ profile row + drag handle (matches collapsed parent layout). */
const HEADER_COLLAPSED_EST = 72;
/** Open header ≈ profile + progress + quote + handle. */
const HEADER_EXPANDED_EST = 170;
const CONTENT_GAP = 12;

export function DashboardClient({
  profile,
  tasks: initialTasks,
  userTasks: initialUserTasks,
  milestones,
  initialActive,
  sessionExp,
  sessionLogs = [],
  tasksWarning,
  subjectIds = [],
  subjectNickname = null,
  subjectInviteCode = null,
  dailyQuote,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [openingProfile, setOpeningProfile] = useState(false);
  const [active, setActive] = useState(initialActive);
  const [tasks, setTasks] = useState(initialTasks);
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
  const [quote, setQuote] = useState(dailyQuote);
  const [quoteSpinning, setQuoteSpinning] = useState(false);
  const [pathMilestones, setPathMilestones] = useState(milestones);
  const [prizeEditorOpen, setPrizeEditorOpen] = useState(false);

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
  /** Auto: EXP/20 + task gems, rounded down for display. */
  const gems = Math.floor(totalEffectiveGems(totalExp, taskGems));

  useEffect(() => {
    collapsedRef.current = progressCollapsed;
  }, [progressCollapsed]);

  // Warm profile route + API so opening profile feels instant.
  useEffect(() => {
    router.prefetch("/profile");
    prefetchProfile();
  }, [router]);

  useEffect(() => {
    if (pathname === "/dashboard") setOpeningProfile(false);
  }, [pathname]);

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
    setTasks(initialTasks);
  }, [initialTasks]);

  useEffect(() => {
    setUserTasks(initialUserTasks);
  }, [initialUserTasks]);

  useEffect(() => {
    setLogs(sessionLogs);
    setLiveSessionExp(sessionExp);
  }, [sessionLogs, sessionExp]);

  useEffect(() => {
    setQuote(dailyQuote);
  }, [dailyQuote]);

  useEffect(() => {
    setPathMilestones(milestones);
  }, [milestones]);

  function spinQuote() {
    if (quoteSpinning) return;
    setQuoteSpinning(true);
    window.setTimeout(() => {
      setQuote(getRandomQuote(quote));
      setQuoteSpinning(false);
    }, 420);
  }

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
  }, [pathMilestones, gems, quote.quote]);

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

  async function refreshMilestones() {
    const subject = subjectIds[0];
    const qs = subject ? `?user_id=${encodeURIComponent(subject)}` : "";
    try {
      const res = await fetch(`/api/milestones${qs}`);
      if (!res.ok) return;
      const data = (await res.json()) as { milestones?: Milestone[] };
      if (data.milestones) setPathMilestones(data.milestones);
    } catch {
      // keep current
    }
  }

  async function refreshTasks() {
    const res = await fetch("/api/tasks");
    if (!res.ok) return;
    const data = (await res.json()) as {
      tasks?: Task[];
      userTasks: UserTask[];
    };
    // Import/create inserts new task *instances* — must refresh tasks too,
    // not only user_tasks, or Your Tasks stays empty (ids won't match).
    if (data.tasks) setTasks(data.tasks);
    setUserTasks(data.userTasks ?? []);
    await refreshMilestones();
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
          <Link
            href="/profile"
            prefetch
            onClick={() => setOpeningProfile(true)}
            className="flex min-w-0 items-center gap-3 rounded-2xl text-left transition active:opacity-80"
            aria-label="Open profile"
            aria-busy={openingProfile || undefined}
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
                {openingProfile ? (
                  <div
                    className="absolute inset-0 z-10 flex items-center justify-center bg-black/40"
                    aria-hidden
                  >
                    <SpinnerIcon size={18} className="text-white" />
                  </div>
                ) : null}
              </div>
            </div>
            <p className="truncate text-base font-semibold text-ink">
              {profile.nickname}
            </p>
          </Link>

          <button
            type="button"
            onClick={() => setPrizeEditorOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-[rgba(200,146,42,0.2)] bg-[rgba(252,221,166,0.4)] py-1.5 pl-2.5 pr-2.5 transition active:brightness-95"
            aria-label="Your EXP and gems — open prize path"
          >
            <span className="flex items-center gap-1 text-xs font-semibold text-gold">
              <BoltIcon size={14} />
              {totalExp.toFixed(1)} EXP
            </span>
            <span className="text-xs font-semibold text-[rgba(28,22,16,0.35)]" aria-hidden>
              →
            </span>
            <span className="flex items-center gap-1 text-xs font-semibold text-[#7b68ee]">
              <GemIcon size={14} />
              {gems}
            </span>
          </button>
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
              milestones={pathMilestones}
              currentGems={gems}
              compact
              onOpenEditor={() => setPrizeEditorOpen(true)}
            />
            <button
              type="button"
              onClick={spinQuote}
              disabled={quoteSpinning}
              aria-label="Show another quote"
              className="mt-2 w-full rounded-2xl border border-[rgba(200,146,42,0.16)] bg-[rgba(255,250,242,0.92)] px-2.5 py-3 text-left shadow-[inset_0px_1px_4px_0px_rgba(0,0,0,0.03)] transition enabled:active:scale-[0.99] disabled:cursor-wait"
            >
              <div className="flex gap-2">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center text-gold">
                  {quoteSpinning ? (
                    <SpinnerIcon size={18} className="text-gold" />
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      className="size-5"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M7.2 18c-1.9 0-3.4-.6-4.4-1.7C1.6 15.1 1 13.5 1 11.4c0-2.3.7-4.3 2.1-6.1C4.6 3.5 6.7 2.3 9.4 1.7L10.2 4c-1.5.4-2.7 1.1-3.5 2.1-.8 1-1.2 2-1.2 3.1 0 .5.1.9.2 1.2.5-.3 1.1-.5 1.8-.5 1.1 0 2 .3 2.7 1 .7.6 1.1 1.5 1.1 2.6 0 1.1-.4 2-1.1 2.7-.8.7-1.7 1.1-3 1.1Zm11.2 0c-1.9 0-3.4-.6-4.4-1.7-1.2-1.2-1.8-2.8-1.8-4.9 0-2.3.7-4.3 2.1-6.1 1.5-1.8 3.6-3 6.3-3.6L21.4 4c-1.5.4-2.7 1.1-3.5 2.1-.8 1-1.2 2-1.2 3.1 0 .5.1.9.2 1.2.5-.3 1.1-.5 1.8-.5 1.1 0 2 .3 2.7 1 .7.6 1.1 1.5 1.1 2.6 0 1.1-.4 2-1.1 2.7-.8.7-1.7 1.1-3 1.1Z" />
                    </svg>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-lg font-bold leading-snug text-ink transition-opacity duration-200 ${
                      quoteSpinning ? "opacity-40" : "opacity-100"
                    }`}
                  >
                    {quote.quote}
                  </p>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[1.2px] text-gold">
                      {quote.theme || "Inspiration"}
                    </p>
                    <p className="shrink-0 text-[11px] text-[rgba(28,22,16,0.55)]">
                      {quote.author}
                    </p>
                  </div>
                </div>
              </div>
            </button>
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
          subjectUserId={subjectIds[0] ?? null}
          subjectNickname={subjectNickname}
          subjectInviteCode={subjectInviteCode}
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

      <PrizePathEditor
        open={prizeEditorOpen}
        onClose={() => setPrizeEditorOpen(false)}
        canEdit={!profile.is_child}
        menteeUserId={subjectIds[0] ?? null}
        milestones={pathMilestones}
        onSaved={(next) => {
          setPathMilestones(next);
          router.refresh();
        }}
      />
    </div>
  );
}
