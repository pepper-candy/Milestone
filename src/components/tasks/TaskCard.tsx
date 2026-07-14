"use client";

import {
  BookIcon,
  BoltIcon,
  CheckIcon,
  CloseIcon,
  GemIcon,
  LockIcon,
  SpinnerIcon,
  TargetIcon,
} from "@/components/ui/Icons";
import { detailForTask } from "@/lib/task-details";
import type { Task, UserTask } from "@/types";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

export type TaskCardAction = "complete" | "approve" | "claim" | "dismiss";

const EXIT_MS = 500;
const EXPAND_MS = 500;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Timed expand / reverse collapse with synced title+lead fades. */
type Phase =
  | "closed"
  | "opening-sides" // 0.5s: sides left + compact text fade out
  | "opening-body" // 0.5s: height expand; expanded text fade in
  | "open"
  | "closing-body" // collapse started; expanded text still visible briefly
  | "closing-text" // 0.5s collapse; expanded text fade out
  | "closing-sides"; // 0.5s: sides right + compact text fade in

type TaskCardProps = {
  task?: Task;
  userTask?: UserTask;
  isChild?: boolean;
  locked?: boolean;
  lockHints?: string[];
  variant?: "default" | "log";
  logTitle?: string;
  logExp?: number;
  logGem?: number;
  completedAt?: string | null;
  onAction?: (action: TaskCardAction) => void;
  busy?: boolean;
};

export function formatCompletedOn(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getDate();
  const month = d.toLocaleString("en-GB", { month: "long" });
  const year = d.getFullYear();
  return `Completed on ${day} ${month}, ${year}`;
}

function TaskGlyph({
  task,
  locked,
  claimed,
}: {
  task: Task;
  locked: boolean;
  claimed: boolean;
}) {
  if (locked) {
    return <LockIcon size={20} className="text-[rgba(138,122,104,0.7)]" />;
  }
  if (claimed) {
    return <CheckIcon size={22} className="text-gold" />;
  }
  const no = task.task_no.toLowerCase();
  if (no.startsWith("math") || no.includes("goal")) {
    return <TargetIcon size={24} className="text-gold" />;
  }
  return <BookIcon size={24} className="text-gold" />;
}

function Rewards({ exp, gem }: { exp: number; gem: number }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="flex items-center gap-0.5 text-[11px] font-semibold text-gold">
        <BoltIcon size={12} />
        {exp}
      </span>
      <span className="flex items-center gap-0.5 text-[11px] font-semibold text-[#7b68ee]">
        <GemIcon size={12} />
        {gem}
      </span>
    </div>
  );
}

function ActionButton({
  action,
  doneLook,
  busy,
  onAction,
}: {
  action: TaskCardAction | null;
  doneLook: boolean;
  busy?: boolean;
  onAction?: (action: TaskCardAction) => void;
}) {
  const showDismiss = action === "dismiss";
  const label =
    action === "claim"
      ? "Claim"
      : action === "approve"
        ? "Approve"
        : action === "dismiss"
          ? "Undo"
          : "Check";
  const ariaLabel =
    action === "claim"
      ? "Claim reward"
      : action === "approve"
        ? "Approve task"
        : action === "dismiss"
          ? "Dismiss pending task"
          : action === "complete"
            ? "Mark complete"
            : "Task status";

  return (
    <button
      type="button"
      disabled={!action || !onAction || busy}
      onClick={(e) => {
        e.stopPropagation();
        if (action && !busy) onAction?.(action);
      }}
      aria-busy={busy || undefined}
      aria-label={ariaLabel}
      className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold tracking-wide transition disabled:cursor-default ${
        showDismiss
          ? "bg-[#8a7a68] text-[#fffaf2]"
          : doneLook
            ? "bg-gold text-[#fffaf2]"
            : "bg-gold text-[#fffaf2] hover:brightness-95 active:brightness-90"
      }`}
    >
      {busy ? (
        <SpinnerIcon size={14} className="text-[#fffaf2]" />
      ) : showDismiss ? (
        <CloseIcon size={12} />
      ) : (
        <CheckIcon size={14} className="text-[#fffaf2]" />
      )}
      {label}
    </button>
  );
}

function resolveAction(
  locked: boolean,
  isChild: boolean,
  status: string | undefined,
): { action: TaskCardAction | null; doneLook: boolean } {
  const claimed = status === "claimed";
  const verified = status === "verified";
  const pending = status === "pending";
  const available = !status || status === "available";
  let action: TaskCardAction | null = null;
  let doneLook = claimed;

  if (!locked) {
    if (isChild) {
      if (available) action = "complete";
      else if (pending) action = "dismiss";
      else if (verified) action = "claim";
      else if (claimed) doneLook = true;
    } else if (pending) {
      action = "approve";
    } else if (claimed || verified) {
      doneLook = true;
    }
  }
  return { action, doneLook };
}

function useStagedExpand(enabled: boolean) {
  const [phase, setPhase] = useState<Phase>("closed");
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  function clearTimer() {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function startClose() {
    clearTimer();
    // Height collapses 0.5s with expanded labels fading out, then sides return 0.5s.
    setPhase("closing-body");
    timer.current = window.setTimeout(() => {
      setPhase("closing-text");
      timer.current = window.setTimeout(() => {
        setPhase("closing-sides");
        timer.current = window.setTimeout(() => setPhase("closed"), EXIT_MS);
      }, EXIT_MS);
    }, EXPAND_MS - EXIT_MS);
  }

  function toggle() {
    if (!enabled) return;
    clearTimer();

    if (phase === "closed") {
      setPhase("opening-sides");
      timer.current = window.setTimeout(() => {
        setPhase("opening-body");
        timer.current = window.setTimeout(() => setPhase("open"), EXPAND_MS);
      }, EXIT_MS);
      return;
    }

    if (phase === "opening-sides") {
      setPhase("closed");
      return;
    }

    startClose();
  }

  const sidesGone =
    phase === "opening-sides" ||
    phase === "opening-body" ||
    phase === "open" ||
    phase === "closing-body" ||
    phase === "closing-text";

  const detailsOpen = phase === "opening-body" || phase === "open";

  const useExpandedCopy =
    phase === "opening-body" ||
    phase === "open" ||
    phase === "closing-body" ||
    phase === "closing-text";

  const labelOpacity =
    phase === "opening-sides" || phase === "closing-text" ? 0 : 1;

  return {
    phase,
    sidesGone,
    detailsOpen,
    useExpandedCopy,
    labelOpacity,
    toggle,
    collapse: startClose,
  };
}

const TEXT_FADE_MS = EXIT_MS;

/** Phase-driven 0.5s fade, synced with side slide / expand. */
function PhaseLabel({
  text,
  opacity,
  className,
  phase,
}: {
  text: string;
  opacity: number;
  className?: string;
  phase: Phase;
}) {
  const [shown, setShown] = useState(text);
  const [op, setOp] = useState(opacity);

  useEffect(() => {
    setShown(text);
  }, [text]);

  useEffect(() => {
    if (phase === "opening-body" || phase === "closing-sides") {
      setOp(0);
      const id = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setOp(1));
      });
      return () => window.cancelAnimationFrame(id);
    }
    setOp(opacity);
  }, [phase, opacity]);

  return (
    <p
      className={className}
      style={{
        opacity: op,
        transition: `opacity ${TEXT_FADE_MS}ms ease`,
      }}
    >
      {shown}
    </p>
  );
}

const exitStyle = (gone: boolean): CSSProperties => ({
  opacity: gone ? 0 : 1,
  transform: gone ? "translateX(-120%)" : "translateX(0)",
  transition: `opacity ${EXIT_MS}ms ${EASE}, transform ${EXIT_MS}ms ${EASE}, width ${EXIT_MS}ms ${EASE}, min-width ${EXIT_MS}ms ${EASE}`,
  pointerEvents: gone ? "none" : "auto",
});

/** Reserved width so compact title/lead clears the absolute action rail. */
const ACTION_RAIL_PR = "pr-[5.75rem]";
const REWARDS_RAIL_PR = "pr-14";

/** Pure height-reveal details; lead uses PhaseLabel for timed fades. */
function ExpandingBody({
  paragraphs,
  compactLine,
  detailsOpen,
  useExpandedCopy,
  labelOpacity,
  phase,
  reserveRail,
}: {
  paragraphs: string[];
  compactLine: string;
  detailsOpen: boolean;
  useExpandedCopy: boolean;
  labelOpacity: number;
  phase: Phase;
  /** Inset lead (and compact mode) to clear the action rail — same width as title. */
  reserveRail?: string;
}) {
  const leadText = useExpandedCopy
    ? paragraphs[0] || compactLine
    : compactLine || paragraphs[0] || "";

  return (
    <div
      className="mt-0.5"
      style={{
        maxHeight: detailsOpen ? 560 : 18,
        overflow: "hidden",
        transition: `max-height ${EXPAND_MS}ms ${EASE}`,
      }}
    >
      <div className="space-y-2">
        <PhaseLabel
          phase={phase}
          text={leadText}
          opacity={labelOpacity}
          className={`${
            useExpandedCopy
              ? "text-xs leading-relaxed text-[rgba(28,22,16,0.72)]"
              : "truncate text-xs leading-[16.5px] text-[#8a7a68]"
          }${reserveRail ? ` ${reserveRail}` : ""}`}
        />
        {paragraphs.slice(1).map((para) => (
          <p
            key={para}
            className="text-xs leading-relaxed text-[rgba(28,22,16,0.72)]"
          >
            {para}
          </p>
        ))}
      </div>
    </div>
  );
}

export function TaskCard({
  task,
  userTask,
  isChild = true,
  locked = false,
  lockHints,
  variant = "default",
  logTitle,
  logExp,
  logGem,
  completedAt,
  onAction,
  busy = false,
}: TaskCardProps) {
  const detail = detailForTask(task);
  const canExpand = Boolean(detail) && !locked;
  const {
    phase,
    sidesGone,
    detailsOpen,
    useExpandedCopy,
    labelOpacity,
    toggle,
  } = useStagedExpand(canExpand);

  // -------- Finished / session log --------
  if (variant === "log") {
    const title = logTitle ?? task?.category ?? task?.title ?? "Session";
    const exp = logExp ?? task?.exp ?? 0;
    const gem = logGem ?? task?.gem ?? 0;
    const dateLine = formatCompletedOn(completedAt);

    if (!canExpand || !detail || !task) {
      return (
        <article className="flex h-[58px] overflow-hidden rounded-2xl border border-[rgba(200,146,42,0.18)] bg-[rgba(255,250,242,0.9)] shadow-[0px_2px_16px_0px_rgba(200,146,42,0.08)]">
          <div className="flex w-12 shrink-0 items-center justify-center bg-[rgba(252,221,166,0.35)]">
            {task ? (
              <TaskGlyph task={task} locked={false} claimed />
            ) : (
              <CheckIcon size={18} className="text-gold" />
            )}
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-[19px] text-ink">
                {title}
              </p>
              {dateLine ? (
                <p className="mt-0.5 truncate text-xs leading-[16.5px] text-[#8a7a68]">
                  {dateLine}
                </p>
              ) : null}
            </div>
            <Rewards exp={exp} gem={gem} />
          </div>
        </article>
      );
    }

    return (
      <article
        className="relative cursor-pointer overflow-hidden rounded-2xl border border-[rgba(200,146,42,0.18)] bg-[rgba(255,250,242,0.9)] shadow-[0px_2px_16px_0px_rgba(200,146,42,0.08)]"
        onClick={toggle}
        aria-expanded={detailsOpen}
      >
        <div className="absolute top-0 right-0 z-10 flex items-start py-2 pr-3">
          <Rewards exp={exp} gem={gem} />
        </div>
        <div className="flex items-start overflow-hidden">
          <div
            className="flex shrink-0 items-center justify-center overflow-hidden bg-[rgba(252,221,166,0.35)]"
            style={{
              ...exitStyle(sidesGone),
              width: sidesGone ? 0 : 48,
              minWidth: sidesGone ? 0 : 48,
              height: 58,
            }}
          >
            <TaskGlyph task={task} locked={false} claimed />
          </div>

          <div className="min-w-0 flex-1 px-3 py-2">
            <div className={REWARDS_RAIL_PR}>
              <p className="text-[11px] font-semibold uppercase tracking-[1.32px] text-[#8a7a68]">
                {task.task_no}
              </p>
              <PhaseLabel
                phase={phase}
                text={useExpandedCopy ? detail.fullTitle : title}
                opacity={labelOpacity}
                className="text-sm font-semibold leading-snug text-ink"
              />
            </div>

            <ExpandingBody
              paragraphs={detail.paragraphs}
              compactLine={dateLine || detail.paragraphs[0] || ""}
              detailsOpen={detailsOpen}
              useExpandedCopy={useExpandedCopy}
              labelOpacity={labelOpacity}
              phase={phase}
              reserveRail={REWARDS_RAIL_PR}
            />
          </div>
        </div>
      </article>
    );
  }

  // -------- Locked / Your Tasks --------
  if (!task) return null;

  const { action, doneLook } = resolveAction(
    locked,
    isChild,
    userTask?.status,
  );
  const status = userTask?.status;
  const claimed = status === "claimed";
  const pending = status === "pending";
  const verified = status === "verified";
  const unmetHints = (lockHints ?? []).filter(Boolean);
  const compactTitle = task.category || task.title || task.task_no;
  const compactSubtitle =
    locked
      ? null
      : pending && isChild
        ? "Pending"
        : verified && isChild
          ? "Ready to claim"
          : task.description || null;
  const showAction = !locked && Boolean(action || doneLook);
  const displayTitle = useExpandedCopy && detail
    ? detail.fullTitle
    : compactTitle;

  if (locked) {
    return (
      <article className="flex min-h-[82px] overflow-hidden rounded-2xl border border-[rgba(200,146,42,0.08)] bg-[rgba(240,232,216,0.5)] opacity-70 shadow-[0px_2px_16px_0px_rgba(200,146,42,0.08)]">
        <div className="flex w-16 shrink-0 items-center justify-center bg-[rgba(200,146,42,0.06)]">
          <TaskGlyph task={task} locked claimed={false} />
        </div>
        <div className="min-w-0 flex-1 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[1.32px] text-[#8a7a68]">
            {task.task_no}
          </p>
          <p className="truncate text-sm font-semibold leading-[19px] text-ink">
            {compactTitle}
          </p>
          {unmetHints.map((hint) => (
            <p
              key={hint}
              className="mt-0.5 truncate text-xs leading-[16.5px] text-[#8a7a68]"
            >
              {hint}
            </p>
          ))}
        </div>
      </article>
    );
  }

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border border-[rgba(200,146,42,0.18)] bg-[rgba(255,250,242,0.9)] shadow-[0px_2px_16px_0px_rgba(200,146,42,0.08)] ${
        canExpand ? "cursor-pointer" : ""
      }`}
      onClick={toggle}
      aria-expanded={detailsOpen}
    >
      {/* Fixed top-right rail; expanded body uses the space underneath */}
      <div className="absolute top-0 right-0 z-10 flex h-[82px] flex-col items-end justify-between py-3 pr-3">
        <Rewards exp={task.exp} gem={task.gem} />
        {showAction ? (
          <ActionButton
            action={action}
            doneLook={doneLook}
            busy={busy}
            onAction={onAction}
          />
        ) : null}
      </div>

      <div className="flex items-start overflow-hidden">
        {/* Stage 1 (0.5s): glyph slides left; compact title/lead fade out in parallel */}
        <div
          className="flex shrink-0 items-center justify-center overflow-hidden bg-[rgba(252,221,166,0.35)]"
          style={{
            ...exitStyle(sidesGone),
            width: sidesGone ? 0 : 64,
            minWidth: sidesGone ? 0 : 64,
            alignSelf: "stretch",
            minHeight: 82,
          }}
        >
          <TaskGlyph task={task} locked={false} claimed={claimed} />
        </div>

        <div className="min-w-0 flex-1 p-3">
          <div className={ACTION_RAIL_PR}>
            <p className="text-[11px] font-semibold uppercase tracking-[1.32px] text-[#8a7a68]">
              {task.task_no}
            </p>
            <PhaseLabel
              phase={phase}
              text={displayTitle}
              opacity={labelOpacity}
              className="text-sm font-semibold leading-snug text-ink"
            />
          </div>

          {detail ? (
            <ExpandingBody
              paragraphs={detail.paragraphs}
              compactLine={
                compactSubtitle || detail.paragraphs[0] || ""
              }
              detailsOpen={detailsOpen}
              useExpandedCopy={useExpandedCopy}
              labelOpacity={labelOpacity}
              phase={phase}
              reserveRail={ACTION_RAIL_PR}
            />
          ) : compactSubtitle ? (
            <p
              className={`mt-0.5 truncate text-xs leading-[16.5px] text-[#8a7a68] ${ACTION_RAIL_PR}`}
            >
              {compactSubtitle}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}
