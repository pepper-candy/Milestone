"use client";

import {
  BookIcon,
  BoltIcon,
  CheckIcon,
  CloseIcon,
  FootprintsIcon,
  GemIcon,
  LockIcon,
  MicIcon,
  SparkIcon,
  SpinnerIcon,
  TargetIcon,
} from "@/components/ui/Icons";
import { categoryKeyForTask, detailForTask } from "@/lib/task-details";
import type { Task, UserTask } from "@/types";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

export type TaskCardAction =
  | "complete"
  | "approve"
  | "claim"
  | "dismiss"
  | "undo";

const EXIT_MS = 500;
const EXPAND_MS = 500;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** 5s completed ritual: wash 1s → COMPLETED → hide card chrome at 2s → hold → fade out 1s */
export const CELEBRATE_WASH_MS = 1000;
export const CELEBRATE_HOLD_MS = 3000;
export const CELEBRATE_FADE_MS = 1000;
export const CELEBRATE_TOTAL_MS =
  CELEBRATE_WASH_MS + CELEBRATE_HOLD_MS + CELEBRATE_FADE_MS;
/** When to clear underlying card elements so only COMPLETED remains. */
const CELEBRATE_CONTENT_HIDE_MS = 2000;
const CELEBRATE_LABEL_FADE_MS = 500;
const WASH_COLOR = "#fdefd6";

function CompletionRitual({
  active,
  onContentHide,
  onFadeStart,
  onDone,
}: {
  active: boolean;
  onContentHide?: () => void;
  onFadeStart?: () => void;
  onDone?: () => void;
}) {
  const [washOn, setWashOn] = useState(false);
  const [labelOn, setLabelOn] = useState(false);
  const [washClear, setWashClear] = useState(false);
  const [cardFade, setCardFade] = useState(false);
  const doneRef = useRef(false);
  const onContentHideRef = useRef(onContentHide);
  const onFadeStartRef = useRef(onFadeStart);
  const onDoneRef = useRef(onDone);
  onContentHideRef.current = onContentHide;
  onFadeStartRef.current = onFadeStart;
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!active) {
      setWashOn(false);
      setLabelOn(false);
      setWashClear(false);
      setCardFade(false);
      doneRef.current = false;
      return;
    }

    doneRef.current = false;
    const raf = window.requestAnimationFrame(() => setWashOn(true));

    const tHold = window.setTimeout(() => {
      setLabelOn(true);
    }, CELEBRATE_WASH_MS);

    // At 2s: drop wash + card chrome; COMPLETED stays alone on the box.
    const tContent = window.setTimeout(() => {
      setWashClear(true);
      onContentHideRef.current?.();
    }, CELEBRATE_CONTENT_HIDE_MS);

    const tFade = window.setTimeout(() => {
      setCardFade(true);
      onFadeStartRef.current?.();
    }, CELEBRATE_WASH_MS + CELEBRATE_HOLD_MS);

    const tDone = window.setTimeout(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        onDoneRef.current?.();
      }
    }, CELEBRATE_TOTAL_MS);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(tHold);
      window.clearTimeout(tContent);
      window.clearTimeout(tFade);
      window.clearTimeout(tDone);
    };
  }, [active]);

  if (!active) return null;

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-20 origin-top"
        style={{
          background: WASH_COLOR,
          transform: washOn ? "scaleY(1)" : "scaleY(0)",
          transition: `transform ${CELEBRATE_WASH_MS}ms ${EASE}, opacity ${CELEBRATE_LABEL_FADE_MS}ms ease`,
          opacity: washClear || cardFade ? 0 : 1,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
        style={{
          opacity: cardFade ? 0 : labelOn ? 1 : 0,
          transition: `opacity ${
            cardFade ? CELEBRATE_FADE_MS : CELEBRATE_LABEL_FADE_MS
          }ms ease`,
        }}
      >
        <p
          className="text-sm font-semibold uppercase tracking-[0.28em]"
          style={{ color: "#c8922a" }}
        >
          Completed
        </p>
      </div>
    </>
  );
}

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
  /** Session duration for press-to-reveal subtitle (HH:MM:SS). */
  logDurationSeconds?: number | null;
  /** Parent nickname shown after duration on press (tutorials). */
  logSignedBy?: string | null;
  /** Working-session location check for press-to-reveal subtitle. */
  logLocationConsistent?: boolean | null;
  onAction?: (action: TaskCardAction) => void;
  busy?: boolean;
  /** Play 5s completed ritual (wash → COMPLETED → fade out). */
  celebrate?: boolean;
  onCelebrateDone?: () => void;
  onCelebrateFadeStart?: () => void;
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

function formatSessionClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Compact log subtitle: date ↔ duration · Signed by / Location status.
 * Only animates when this card is toggled — not on remount (section open / session list). */
function LogSubtitle({
  primary,
  alternate,
  revealed,
}: {
  primary: string;
  alternate: {
    clock: string;
    signedBy: string | null;
    locationConsistent: boolean | null;
  } | null;
  revealed: boolean;
}) {
  const targetKey = revealed && alternate ? "alt" : "primary";
  const [shownKey, setShownKey] = useState(targetKey);
  const [opacity, setOpacity] = useState(1);
  const prevKey = useRef(targetKey);

  useEffect(() => {
    if (prevKey.current === targetKey) {
      setShownKey(targetKey);
      return;
    }
    prevKey.current = targetKey;
    setOpacity(0);
    const outId = window.setTimeout(() => {
      setShownKey(targetKey);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setOpacity(1));
      });
    }, EXIT_MS);
    return () => window.clearTimeout(outId);
  }, [targetKey]);

  return (
    <p
      className="mt-0.5 truncate text-xs leading-[16.5px] text-[#8a7a68]"
      style={{
        opacity,
        transition: `opacity ${EXIT_MS}ms ease`,
      }}
    >
      {shownKey === "alt" && alternate ? (
        <>
          {alternate.clock}
          {alternate.signedBy ? (
            <>
              <span aria-hidden> · </span>
              Signed by{" "}
              <span className="font-bold text-ink">{alternate.signedBy}</span>
            </>
          ) : alternate.locationConsistent != null ? (
            <>
              <span aria-hidden> · </span>
              Location{" "}
              <span className="font-bold text-ink">
                {alternate.locationConsistent ? "Consistent" : "Inconsistent"}
              </span>
            </>
          ) : null}
        </>
      ) : (
        primary
      )}
    </p>
  );
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

  const kind = categoryKeyForTask(task);
  const iconClass = "text-gold";

  switch (kind) {
    case "community":
      return <FootprintsIcon size={24} className={iconClass} />;
    case "eng_speak":
      return <MicIcon size={24} className={iconClass} />;
    case "eng_vocab":
      return <SparkIcon size={24} className={iconClass} />;
    case "eng_writing":
      return <BookIcon size={24} className={iconClass} />;
    case "math_consolidation":
    case "math_prelearning":
      return <TargetIcon size={24} className={iconClass} />;
    default: {
      const no = task.task_no.toLowerCase();
      if (no.startsWith("math") || no.includes("goal")) {
        return <TargetIcon size={24} className={iconClass} />;
      }
      return <BookIcon size={24} className={iconClass} />;
    }
  }
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
      ? "CLAIM"
      : action === "approve"
        ? "PASS"
        : action === "dismiss" || action === "undo"
          ? "UNDO"
          : "CHECK";
  const ariaLabel =
    action === "claim"
      ? "Claim reward"
      : action === "approve"
        ? "Pass task"
        : action === "dismiss"
          ? "Dismiss pending task"
          : action === "undo"
            ? "Undo passed or finished task"
          : action === "complete"
            ? "Mark complete"
            : "Task status";

  const isUndo = showDismiss || action === "undo";
  const useSwipeGradient = !isUndo;

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
      className={`inline-flex h-8 items-center gap-1 rounded-full pl-2.5 pr-3 text-[11px] font-semibold tracking-wide text-[#fffaf2] transition disabled:cursor-default ${
        isUndo
          ? "bg-[#8a7a68]"
          : "hover:brightness-95 active:brightness-90"
      }`}
      style={
        useSwipeGradient
          ? {
              backgroundImage:
                "linear-gradient(151deg, rgb(252, 221, 166) 0%, rgb(200, 146, 42) 100%)",
              boxShadow: "0px 2px 8px 0px rgba(200, 146, 42, 0.35)",
            }
          : undefined
      }
    >
      {busy ? (
        <SpinnerIcon size={14} className="text-[#fffaf2]" />
      ) : isUndo ? (
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
    } else if (verified || claimed) {
      action = "undo";
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

/** Inline **bold** + preserved newlines from task-details. */
function DetailRichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        const bold = /^\*\*([^*]+)\*\*$/.exec(part);
        if (bold) {
          return (
            <strong key={i} className="font-semibold text-ink">
              {bold[1]}
            </strong>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

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

const COLLAPSED_BODY_H = 18;
/** Even height reveal so expand doesn't front-load (oversized max-height + ease-out pops). */
const HEIGHT_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

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
  // Expanded: lead stays PhaseLabel only; Aim + body are separate.
  const leadText = useExpandedCopy
    ? paragraphs[0] || compactLine
    : compactLine || paragraphs[0] || "";
  const bodyParas = useExpandedCopy ? paragraphs.slice(1) : [];
  const innerRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState(COLLAPSED_BODY_H);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    if (!detailsOpen) {
      setMaxH(COLLAPSED_BODY_H);
      return;
    }

    const target = el.scrollHeight;
    setMaxH(COLLAPSED_BODY_H);
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => setMaxH(target));
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [detailsOpen, leadText, useExpandedCopy, paragraphs]);

  return (
    <div
      className="mt-0.5"
      style={{
        maxHeight: maxH,
        overflow: "hidden",
        transition: `max-height ${EXPAND_MS}ms ${
          detailsOpen ? HEIGHT_EASE : EASE
        }`,
      }}
    >
      <div ref={innerRef} className="space-y-2">
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
        {bodyParas.map((para, i) => (
          <p
            key={`${i}-${para.slice(0, 24)}`}
            className="whitespace-pre-line text-xs leading-relaxed text-[rgba(28,22,16,0.72)]"
          >
            <DetailRichText text={para} />
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
  logDurationSeconds,
  logSignedBy,
  logLocationConsistent,
  onAction,
  busy = false,
  celebrate = false,
  onCelebrateDone,
  onCelebrateFadeStart,
}: TaskCardProps) {
  const detail = detailForTask(task);
  const canExpand = Boolean(detail) && !locked && !celebrate;
  const [celebrateFading, setCelebrateFading] = useState(false);
  const [celebrateContentGone, setCelebrateContentGone] = useState(false);
  const [logRevealed, setLogRevealed] = useState(false);
  const logFlipBusy = useRef(false);

  useEffect(() => {
    if (!celebrate) {
      setCelebrateFading(false);
      setCelebrateContentGone(false);
    }
  }, [celebrate]);

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
    const sessionReveal =
      typeof logDurationSeconds === "number"
        ? {
            clock: formatSessionClock(logDurationSeconds),
            signedBy: logSignedBy?.trim() || null,
            locationConsistent:
              typeof logLocationConsistent === "boolean"
                ? logLocationConsistent
                : null,
          }
        : null;
    const canRevealSubtitle = Boolean(dateLine && sessionReveal);

    if (!canExpand || !detail || !task) {
      return (
        <article
          className={`relative flex h-[58px] overflow-hidden rounded-2xl border border-[rgba(200,146,42,0.18)] bg-[rgba(255,250,242,0.9)] shadow-[0px_2px_16px_0px_rgba(200,146,42,0.08)]${
            canRevealSubtitle ? " cursor-pointer" : ""
          }`}
          onClick={
            canRevealSubtitle
              ? () => {
                  if (logFlipBusy.current) return;
                  logFlipBusy.current = true;
                  setLogRevealed((v) => !v);
                  window.setTimeout(() => {
                    logFlipBusy.current = false;
                  }, EXIT_MS * 2);
                }
              : undefined
          }
        >
          <div className="absolute top-0 right-0 z-10 flex items-start py-2 pr-3">
            <Rewards exp={exp} gem={gem} />
          </div>
          <div className="flex w-16 shrink-0 items-center justify-center bg-[rgba(252,221,166,0.35)]">
            {task ? (
              <TaskGlyph task={task} locked={false} claimed />
            ) : (
              <CheckIcon size={22} className="text-gold" />
            )}
          </div>
          <div className="min-w-0 flex-1 px-3 py-2">
            <div className={REWARDS_RAIL_PR}>
              <p className="truncate text-sm font-semibold leading-[19px] text-ink">
                {title}
              </p>
              {dateLine ? (
                <LogSubtitle
                  primary={dateLine}
                  alternate={sessionReveal}
                  revealed={logRevealed}
                />
              ) : null}
            </div>
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
              width: sidesGone ? 0 : 64,
              minWidth: sidesGone ? 0 : 64,
              alignSelf: "stretch",
              minHeight: 58,
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
              compactLine={dateLine || detail.lead || ""}
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
        ? "Pending Mentor Review"
        : verified && isChild
          ? "Claim to Complete"
          : verified && !isChild
            ? "Marked as Passed"
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
      className={`relative overflow-hidden rounded-2xl border border-[rgba(200,146,42,0.18)] shadow-[0px_2px_16px_0px_rgba(200,146,42,0.08)] ${
        canExpand ? "cursor-pointer" : ""
      } ${celebrate ? "" : "bg-[rgba(255,250,242,0.9)]"}`}
      onClick={celebrate ? undefined : toggle}
      aria-expanded={detailsOpen}
      style={{
        opacity: celebrateFading ? 0 : 1,
        background: celebrate ? WASH_COLOR : undefined,
        transition: celebrate
          ? `opacity ${CELEBRATE_FADE_MS}ms ease`
          : undefined,
        pointerEvents: celebrate ? "none" : undefined,
      }}
    >
      <CompletionRitual
        active={celebrate}
        onContentHide={() => setCelebrateContentGone(true)}
        onFadeStart={() => {
          setCelebrateFading(true);
          onCelebrateFadeStart?.();
        }}
        onDone={onCelebrateDone}
      />

      <div
        style={{
          opacity: celebrateContentGone ? 0 : 1,
          transition: celebrate
            ? `opacity ${CELEBRATE_LABEL_FADE_MS}ms ease`
            : undefined,
        }}
        aria-hidden={celebrateContentGone || undefined}
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
                  compactSubtitle || detail.lead || ""
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
      </div>
    </article>
  );
}
