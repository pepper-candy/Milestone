"use client";

import {
  BookIcon,
  BoltIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  FootprintsIcon,
  GemIcon,
  ImportIcon,
  LockIcon,
  MicIcon,
  PencilIcon,
  SparkIcon,
  SpinnerIcon,
  TargetIcon,
  TrashIcon,
} from "@/components/ui/Icons";
import { categoryKeyForTask, detailForTask } from "@/lib/task-details";
import {
  draftPrerequisites,
  filledPrereqCount,
  prereqSidebarLabel,
  serializePrereqsForSave,
} from "@/lib/task-prerequisites";
import type { Task, TaskIconKey, UserTask } from "@/types";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export type TaskCardAction =
  | "complete"
  | "approve"
  | "accept"
  | "claim"
  | "dismiss"
  | "undo";

export type TaskUpdatePatch = {
  task_no: string;
  category: string;
  description: string | null;
  exp: number;
  gem: number;
  icon_key: TaskIconKey | null;
  detail_title: string | null;
  detail_lead: string | null;
  /** Aim + body in one box (blank line between); split on save. */
  detail_extras: string | null;
  /** Prerequisite task_no slots (empty strings ignored on save). */
  prerequisites: string[];
};

/** Payload sent to POST /api/tasks update (detail_extras split into aim + body). */
export type TaskSavePayload = {
  task_no: string;
  category: string;
  description: string | null;
  exp: number;
  gem: number;
  icon_key: TaskIconKey | null;
  detail_title: string | null;
  detail_lead: string | null;
  detail_aim: string | null;
  detail_body: string | null;
  prereq_1?: string | null;
  prereq_2?: string | null;
  prereqs?: string[] | null;
  /** When true, publish this task_no to the shared catalog for others to load. */
  seed_catalog?: boolean;
};

const TASK_NO_LOOKUP_MIN = 3;
const TASK_NO_LOOKUP_DEBOUNCE_MS = 450;

function normalizeTaskNo(value: string): string {
  return value.trim();
}

function serializeDraftForSeed(draft: TaskUpdatePatch): string {
  return JSON.stringify({
    task_no: normalizeTaskNo(draft.task_no),
    category: draft.category.trim(),
    description: (draft.description ?? "").trim(),
    exp: draft.exp,
    gem: draft.gem,
    icon_key: draft.icon_key,
    detail_title: (draft.detail_title ?? "").trim(),
    detail_lead: (draft.detail_lead ?? "").trim(),
    detail_extras: (draft.detail_extras ?? "").trim(),
  });
}

function draftFromCatalogTask(catalog: Task, taskNo: string): TaskUpdatePatch {
  const base = draftFromTask(catalog);
  const trimmed = normalizeTaskNo(taskNo);
  return { ...base, task_no: trimmed || catalog.task_no };
}

function joinDetailExtras(aim: string, body: string): string {
  const a = aim.trim();
  const b = body.trim();
  if (!a) return b;
  if (!b) return a;
  return `${a}\n\n${b}`;
}

function splitDetailExtras(text: string | null | undefined): {
  detail_aim: string | null;
  detail_body: string | null;
} {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { detail_aim: null, detail_body: null };
  const split = trimmed.split(/\n\n/, 2);
  if (split.length === 1) {
    return { detail_aim: emptyToNull(split[0]), detail_body: null };
  }
  return {
    detail_aim: emptyToNull(split[0]),
    detail_body: emptyToNull(split[1]),
  };
}

const EXIT_MS = 500;
const EXPAND_MS = 500;
const PREREQ_CONTENT_FADE_MS = 250;
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
const DELETE_WASH_MS = 1000;
const DELETE_REVEAL_MS = 300;
/** DELETED label: fade in → hold; total up-time before card fade is 1.5s. */
const DELETE_LABEL_FADE_MS = CELEBRATE_LABEL_FADE_MS;
/** Hold after fade-in so fade-in + hold = 1.5s. */
const DELETE_LABEL_HOLD_MS = 1000;
const DELETE_WASH_COLOR = "#ffcdd2";
const DELETE_STRIP_COLOR = "#e57373";
const DELETE_STRIP_W = 64;
/** Chevron tab + horizontal padding; sits to the right of the w-16 sidebar. */
const DELETE_SWIPE_TAB_W = 24;
const DELETE_SIDEBAR_BODY_W = DELETE_STRIP_W;
/** Vertical dash marks on the sidebar seam (dash length + gap). */
const DELETE_SIDEBAR_DASH_LEN_PX = 8;
const DELETE_SIDEBAR_DASH_GAP_PX = 4;
/** Gap between resting swipe strip and the label's left edge. */
const DELETE_LABEL_STRIP_GAP = 12;
const DELETE_SWIPE_HANDLE_REST_W = DELETE_STRIP_W + DELETE_SWIPE_TAB_W;
/** Extra label inset: (chevron tab width) × ¼ for visual breathing room. */
const DELETE_LABEL_EXTRA_RESERVE =
  (DELETE_SWIPE_HANDLE_REST_W - DELETE_SIDEBAR_BODY_W) / 4;

const ICON_OPTIONS: TaskIconKey[] = [
  "target",
  "book",
  "mic",
  "spark",
  "footprints",
];

function defaultIconKeyForTask(task: Task): TaskIconKey {
  const kind = categoryKeyForTask(task);
  switch (kind) {
    case "community":
      return "footprints";
    case "eng_speak":
      return "mic";
    case "eng_vocab":
      return "spark";
    case "eng_writing":
      return "book";
    case "math_consolidation":
    case "math_prelearning":
      return "target";
    default: {
      const no = task.task_no.toLowerCase();
      if (no.startsWith("math") || no.includes("goal")) return "target";
      // Custom / Add New Task cards default to target (same as composer).
      return "target";
    }
  }
}

function emptyDraft(): TaskUpdatePatch {
  return {
    task_no: "",
    category: "",
    description: "",
    exp: 0,
    gem: 0,
    icon_key: "target",
    detail_title: "",
    detail_lead: "",
    detail_extras: "",
    prerequisites: ["", ""],
  };
}

/** Placeholder task for parent “Add New Task” composer. */
export function createBlankTask(): Task {
  return {
    id: "__new__",
    task_no: "",
    category: "",
    exp: 0,
    gem: 0,
    title: null,
    description: null,
    requires_proof: false,
    seq: null,
    prereq_1: null,
    prereq_2: null,
    prereqs: null,
    icon_key: "target",
    detail_title: null,
    detail_lead: null,
    detail_aim: null,
    detail_body: null,
    is_catalog_template: false,
  };
}

function draftFromTask(task: Task): TaskUpdatePatch {
  const detail = detailForTask(task);
  const detailBodyFromCatalog =
    detail?.paragraphs.slice(2).join("\n\n") ?? "";
  const aim =
    task.detail_aim?.trim() || detail?.paragraphs[1] || "";
  const body =
    task.detail_body?.trim() || detailBodyFromCatalog;

  return {
    task_no: task.task_no,
    category: task.category || "",
    description: task.description?.trim() || "",
    exp: task.exp,
    gem: task.gem,
    icon_key: task.icon_key ?? defaultIconKeyForTask(task),
    detail_title:
      task.detail_title?.trim() || detail?.fullTitle || "",
    detail_lead: task.detail_lead?.trim() || detail?.lead || "",
    detail_extras: joinDetailExtras(aim, body),
    prerequisites: draftPrerequisites(task),
  };
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Pen/trash only before the mentee has started the flow (not pending+). */
function parentCanEditStatus(status: string | undefined): boolean {
  return !status || status === "available";
}

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
      setCardFade(false);
      doneRef.current = false;
      return;
    }

    doneRef.current = false;
    const raf = window.requestAnimationFrame(() => setWashOn(true));

    const tHold = window.setTimeout(() => {
      setLabelOn(true);
    }, CELEBRATE_WASH_MS);

    // At 2s: hide card chrome under the still-opaque wash so COMPLETED
    // sits alone — never fade the wash early (that flashes rewards/claim).
    const tContent = window.setTimeout(() => {
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
        className="pointer-events-none absolute inset-0 z-40 origin-top"
        style={{
          background: WASH_COLOR,
          transform: washOn ? "scaleY(1)" : "scaleY(0)",
          transition: `transform ${CELEBRATE_WASH_MS}ms ${EASE}, opacity ${CELEBRATE_FADE_MS}ms ease`,
          opacity: cardFade ? 0 : 1,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center"
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

/** Red wash overlay → swipe from strip to delete (mentee-scoped remove). */
function DeleteRitual({
  active,
  closing,
  busy,
  onConfirm,
  onCancel,
  onCloseComplete,
}: {
  active: boolean;
  closing?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  /** Shown above the pink track, under the deep-red swipe strip. */
  onCancel?: () => void;
  onCloseComplete?: () => void;
}) {
  const [washOn, setWashOn] = useState(false);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deletedLabelOn, setDeletedLabelOn] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLParagraphElement>(null);
  const onCloseCompleteRef = useRef(onCloseComplete);
  onCloseCompleteRef.current = onCloseComplete;
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  const [labelLeft, setLabelLeft] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const offsetRef = useRef(0);
  const draggingRef = useRef(false);
  const confirmStartedRef = useRef(false);

  useEffect(() => {
    if (active) return;
    setWashOn(false);
    setReady(false);
    setRevealed(false);
    setDeleted(false);
    setDeletedLabelOn(false);
    setOffset(0);
    setLabelLeft(null);
    offsetRef.current = 0;
    confirmStartedRef.current = false;
  }, [active]);

  useEffect(() => {
    if (!active || closing) return;
    setRevealed(false);
    setDeleted(false);
    setDeletedLabelOn(false);
    setOffset(0);
    setLabelLeft(null);
    offsetRef.current = 0;
    confirmStartedRef.current = false;
    const raf = window.requestAnimationFrame(() => setWashOn(true));
    const tReady = window.setTimeout(() => setReady(true), DELETE_WASH_MS);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(tReady);
    };
  }, [active, closing]);

  useEffect(() => {
    if (!ready || closing || deleted) {
      if (!ready || closing) setRevealed(false);
      return;
    }
    const raf = window.requestAnimationFrame(() => setRevealed(true));
    return () => window.cancelAnimationFrame(raf);
  }, [ready, closing, deleted]);

  useEffect(() => {
    if (!closing) return;
    setRevealed(false);
    setWashOn(false);
    const tDone = window.setTimeout(() => {
      setReady(false);
      setOffset(0);
      setLabelLeft(null);
      offsetRef.current = 0;
      onCloseCompleteRef.current?.();
    }, DELETE_WASH_MS);
    return () => window.clearTimeout(tDone);
  }, [closing]);

  useLayoutEffect(() => {
    if (!ready || deleted || !revealed) return;

    function placeLabel() {
      const track = contentRef.current;
      const labelEl = labelRef.current;
      if (!track || !labelEl) return;
      const trackW = track.clientWidth;
      const labelW = labelEl.scrollWidth;
      if (trackW <= 0 || labelW <= 0) return;
      const minLeft =
        DELETE_SWIPE_HANDLE_REST_W +
        DELETE_LABEL_STRIP_GAP +
        DELETE_LABEL_EXTRA_RESERVE;
      const centeredLeft = (trackW - labelW) / 2;
      setLabelLeft(Math.max(centeredLeft, minLeft));
    }

    placeLabel();
    const ro = new ResizeObserver(placeLabel);
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [ready, deleted, revealed]);

  function maxOffset() {
    return contentRef.current?.clientWidth ?? 0;
  }

  function setHandleOffset(next: number) {
    offsetRef.current = next;
    setOffset(next);
  }

  function begin(clientX: number) {
    if (!ready || !revealed || closing || busy || deleted) return;
    draggingRef.current = true;
    setDragging(true);
    startX.current = clientX;
    startOffset.current = offsetRef.current;
  }

  function move(clientX: number) {
    if (!draggingRef.current) return;
    const delta = clientX - startX.current;
    const next = Math.min(
      maxOffset(),
      Math.max(0, startOffset.current + delta),
    );
    setHandleOffset(next);
  }

  useEffect(() => {
    if (!deleted) {
      setDeletedLabelOn(false);
      return;
    }

    // Fade in DELETED, hold, then confirm — label stays up and fades with the card.
    const raf = window.requestAnimationFrame(() => setDeletedLabelOn(true));
    const tConfirm = window.setTimeout(() => {
      if (confirmStartedRef.current) return;
      confirmStartedRef.current = true;
      void (async () => {
        try {
          await onConfirmRef.current();
        } catch {
          confirmStartedRef.current = false;
          setDeleted(false);
          setDeletedLabelOn(false);
          setHandleOffset(0);
        }
      })();
    }, DELETE_LABEL_FADE_MS + DELETE_LABEL_HOLD_MS);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(tConfirm);
    };
  }, [deleted]);

  async function end() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    const current = offsetRef.current;
    const limit = maxOffset();
    const threshold = limit * 0.85;
    if (current >= threshold) {
      setHandleOffset(limit);
      setDeleted(true);
    } else {
      setHandleOffset(0);
    }
  }

  if (!active) return null;

  const journey = maxOffset() > 0 ? offset / maxOffset() : 0;
  const journeyLabelOpacity = Math.max(0, 1 - journey / 0.25);
  const labelOpacity = revealed ? journeyLabelOpacity : 0;
  const chromeTransition = dragging
    ? "none"
    : `transform ${DELETE_REVEAL_MS}ms ${EASE}, opacity ${DELETE_REVEAL_MS}ms ${EASE}, width 0.25s ease-out`;

  return (
    <div
      className="absolute inset-0 z-20 overflow-hidden rounded-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 origin-top"
        style={{
          background: DELETE_WASH_COLOR,
          transform: washOn ? "scaleY(1)" : "scaleY(0)",
          transition: `transform ${DELETE_WASH_MS}ms ${EASE}`,
        }}
      />
      {ready ? (
        <div ref={overlayRef} className="absolute inset-0">
          <div className="relative flex h-full">
            <div
              ref={contentRef}
              className="relative z-0 min-w-0 flex-1"
              style={{
                background: deleted
                  ? DELETE_STRIP_COLOR
                  : "rgba(255, 205, 210, 0.55)",
                opacity: revealed || deleted ? 1 : 0,
                transition: `opacity ${DELETE_REVEAL_MS}ms ${EASE}, background ${DELETE_REVEAL_MS}ms ${EASE}`,
              }}
            >
              {!deleted ? (
                <p
                  ref={labelRef}
                  className="pointer-events-none absolute top-0 bottom-0 flex items-center whitespace-nowrap text-[12px] font-semibold uppercase tracking-[1.96px] text-[rgba(183,28,28,0.72)]"
                  style={{
                    left: labelLeft ?? "50%",
                    transform: labelLeft == null ? "translateX(-50%)" : undefined,
                    opacity: labelOpacity,
                    transition: dragging
                      ? "none"
                      : `opacity ${DELETE_REVEAL_MS}ms ${EASE}`,
                  }}
                >
                  SWIPE TO CONFIRM
                </p>
              ) : null}
            </div>
            {/* Cancel in the trash slot (bottom). No rewards here — they'd
                sit on top of the translucent pink confirm track. */}
            {onCancel && !deleted && !closing ? (
              <div className="absolute top-0 right-0 z-[5] flex min-h-[82px] flex-col items-end justify-end gap-1.5 py-3 pr-3">
                <div className="flex items-center gap-1.5">
                  <CircleIconButton
                    label="Cancel remove"
                    tone="red"
                    disabled={busy}
                    onClick={onCancel}
                  >
                    <CloseIcon size={14} />
                  </CircleIconButton>
                </div>
              </div>
            ) : null}
            {/* Keep the deep-red swipe panel at full width after confirm —
                do not snap back to the rest strip. */}
            <div
              className={`absolute left-0 top-0 bottom-0 z-10 flex touch-none ${
                revealed && !closing && !deleted
                  ? "cursor-grab active:cursor-grabbing"
                  : "pointer-events-none"
              }`}
              style={{
                width: deleted
                  ? "100%"
                  : DELETE_STRIP_W + offset + DELETE_SWIPE_TAB_W,
                transform: revealed || deleted ? "translateX(0)" : "translateX(-100%)",
                transition: deleted
                  ? `width ${DELETE_REVEAL_MS}ms ${EASE}`
                  : chromeTransition,
                background: DELETE_STRIP_COLOR,
              }}
              onPointerDown={(e) => {
                if (deleted) return;
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                begin(e.clientX);
              }}
              onPointerMove={(e) => {
                if (deleted || !draggingRef.current) return;
                e.preventDefault();
                e.stopPropagation();
                move(e.clientX);
              }}
              onPointerUp={(e) => {
                if (deleted || !draggingRef.current) return;
                e.preventDefault();
                e.stopPropagation();
                void end();
              }}
              onPointerCancel={(e) => {
                if (deleted || !draggingRef.current) return;
                e.preventDefault();
                e.stopPropagation();
                void end();
              }}
            >
              {!deleted ? (
                <>
                  <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-20 flex w-16 items-center justify-center">
                    <TrashIcon size={24} className="text-white" />
                  </div>
                  <div
                    className="relative box-border h-full shrink-0"
                    style={{
                      width: DELETE_SIDEBAR_BODY_W,
                      background: DELETE_STRIP_COLOR,
                    }}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute right-0 top-0 bottom-0 w-px"
                      style={{
                        backgroundImage: `repeating-linear-gradient(
                          to bottom,
                          rgba(255, 205, 210, 0.85) 0,
                          rgba(255, 205, 210, 0.85) ${DELETE_SIDEBAR_DASH_LEN_PX}px,
                          transparent ${DELETE_SIDEBAR_DASH_LEN_PX}px,
                          transparent ${DELETE_SIDEBAR_DASH_LEN_PX + DELETE_SIDEBAR_DASH_GAP_PX}px
                        )`,
                      }}
                    />
                  </div>
                  <div
                    className="h-full shrink-0"
                    style={{
                      width: offset,
                      background: DELETE_STRIP_COLOR,
                    }}
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none flex h-full shrink-0 items-center justify-center px-2 text-white"
                    style={{
                      width: DELETE_SWIPE_TAB_W,
                      background: DELETE_STRIP_COLOR,
                    }}
                  >
                    <svg
                      width="8"
                      height="12"
                      viewBox="0 0 8 12"
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="M1 1l5 5-5 5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </>
              ) : null}
            </div>
          </div>
          {deleted ? (
            <div
              className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"
              style={{
                opacity: deletedLabelOn ? 1 : 0,
                transition: `opacity ${DELETE_LABEL_FADE_MS}ms ease`,
              }}
            >
              <p className="text-base font-semibold uppercase tracking-[0.28em] text-white">
                Deleted
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
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
  /** Parent Save → persist task fields (last-write-wins). */
  onUpdate?: (patch: TaskSavePayload) => boolean | void | Promise<boolean | void>;
  /** Parent create composer → insert task + assign mentee. */
  onCreate?: (patch: TaskSavePayload) => boolean | void | Promise<boolean | void>;
  onCancelCreate?: () => void;
  /** New-task composer (starts in edit mode). */
  creating?: boolean;
  /** When creating, render inside Add New Task shell (no duplicate card chrome). */
  creatingEmbedded?: boolean;
  /** When creating, reveal inner fields after shell expand. */
  createContentRevealed?: boolean;
  /** When creating, slide sidebar in after content (embedded composer). */
  createSidebarRevealed?: boolean;
  /** Parent Trash → mentee-scoped remove (user_tasks.removed). */
  onRemove?: () => void | Promise<void>;
  busy?: boolean;
  /** Play 5s completed ritual (wash → COMPLETED → fade out). */
  celebrate?: boolean;
  onCelebrateDone?: () => void;
  onCelebrateFadeStart?: () => void;
  /** Fade out after successful delete swipe (TaskList collapses slot). */
  removing?: boolean;
  onRemoveFadeStart?: () => void;
  onRemoveDone?: () => void;
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

function GlyphByKey({
  iconKey,
  className = "text-gold",
  size = 24,
}: {
  iconKey: TaskIconKey | null | undefined;
  className?: string;
  size?: number;
}) {
  switch (iconKey) {
    case "footprints":
      return <FootprintsIcon size={size} className={className} />;
    case "mic":
      return <MicIcon size={size} className={className} />;
    case "spark":
      return <SparkIcon size={size} className={className} />;
    case "book":
      return <BookIcon size={size} className={className} />;
    case "target":
      return <TargetIcon size={size} className={className} />;
    default:
      return null;
  }
}

function TaskGlyph({
  task,
  locked,
  claimed,
  iconOverride,
}: {
  task: Task;
  locked: boolean;
  claimed: boolean;
  iconOverride?: TaskIconKey | null;
}) {
  if (locked) {
    return <LockIcon size={20} className="text-[rgba(138,122,104,0.7)]" />;
  }
  if (claimed) {
    return <CheckIcon size={22} className="text-gold" />;
  }

  const preferred =
    iconOverride ?? task.icon_key ?? defaultIconKeyForTask(task);
  return (
    <GlyphByKey iconKey={preferred} size={24} className="text-gold" />
  );
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

function SteppedRewardSlider({
  kind,
  value,
  min,
  max,
  step,
  onChange,
  compact = false,
}: {
  kind: "exp" | "gem";
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  /** Fill half of the fixed edit slot; track vertically centered in row. */
  compact?: boolean;
}) {
  const [pressing, setPressing] = useState(false);
  const stops: number[] = [];
  for (let v = min; v <= max; v += step) stops.push(v);
  const progress = max === min ? 0 : (value - min) / (max - min);
  const isExp = kind === "exp";
  const accent = isExp ? "#c8922a" : "#7b68ee";
  const accentDeep = isExp ? "#ecc788" : "#b3a7f2";
  const trackBg = isExp ? "rgba(200,146,42,0.22)" : "rgba(123,104,238,0.22)";

  useEffect(() => {
    if (!pressing) return;
    const end = () => setPressing(false);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [pressing]);

  return (
    <div
      className={`relative w-full px-4 ${compact ? "flex h-full min-h-0 items-center py-0" : "py-3"}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative flex h-3 w-full min-w-0 items-center justify-between">
        <div
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full"
          style={{ backgroundColor: trackBg }}
        />
        <div
          className="pointer-events-none absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full transition-[width] duration-150 ease-out"
          style={{
            // Match justify-between stop centers (dot = 0.625rem)
            width: `calc(${progress} * (100% - 0.625rem) + 0.3125rem)`,
            backgroundColor: accent,
          }}
        />

        {stops.map((stop) => {
          const reached = stop <= value;
          const current = stop === value;
          return (
            <button
              key={stop}
              type="button"
              aria-label={`${isExp ? "EXP" : "Gem"} ${stop}`}
              aria-pressed={current}
              className="relative z-10 size-2.5 shrink-0 rounded-full transition-transform duration-150"
              style={{
                backgroundColor: reached ? accentDeep : trackBg,
                transform: current ? "scale(1.2)" : undefined,
              }}
              onPointerDown={() => setPressing(true)}
              onClick={() => onChange(stop)}
            />
          );
        })}

        {/* Chip center-aligned with the active stop; lifts while pressing */}
        <div
          className="pointer-events-none absolute top-1/2 z-30 transition-transform duration-150 ease-out"
          style={{
            left: `calc(${progress} * (100% - 0.625rem) + 0.3125rem)`,
            transform: `translate(-50%, ${pressing ? "calc(-50% - 45px)" : "-50%"})`,
          }}
        >
          <span
            className="flex h-7 min-w-7 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold leading-none text-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.2)]"
            style={{
              backgroundImage: isExp
                ? "linear-gradient(151deg, rgb(252, 221, 166) 0%, rgb(200, 146, 42) 100%)"
                : "linear-gradient(151deg, #b39ddb 0%, #5e35b1 100%)",
            }}
          >
            {isExp ? (
              <BoltIcon size={13} className="text-white" />
            ) : (
              <GemIcon size={13} className="text-white" />
            )}
            {value}
          </span>
        </div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={isExp ? "EXP reward" : "Gem reward"}
        className="absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0"
        onPointerDown={() => setPressing(true)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function CircleIconButton({
  label,
  tone,
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone: "purple" | "red" | "green";
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const iconTone =
    tone === "purple"
      ? "text-[#5e35b1]"
      : tone === "green"
        ? "text-[#2e7d32]"
        : "text-[#c62828]";
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      className={`inline-flex size-8 items-center justify-center rounded-full border border-[rgba(200,146,42,0.2)] bg-surface transition hover:bg-[rgba(252,221,166,0.35)] active:brightness-95 disabled:cursor-wait disabled:opacity-50 ${iconTone}`}
    >
      {children}
    </button>
  );
}

function PrereqSidebarStrip({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label="Edit prerequisites"
      className="flex w-full flex-col items-center justify-center gap-1"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <span className="inline-flex shrink-0 rounded-lg p-1">
        <ChevronDownIcon
          size={22}
          className={`shrink-0 text-gold transition-transform duration-300 ${open ? "rotate-90" : "-rotate-90"}`}
        />
      </span>
      <span
        className="max-h-[9rem] text-center text-[15px] font-semibold uppercase leading-[1.15] tracking-[0.06em] text-[#8a7a68]"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        {prereqSidebarLabel(count)}
      </span>
    </button>
  );
}

function PrereqEditPanel({
  expanded,
  contentVisible,
  prerequisites,
  onChange,
  onAdd,
}: {
  expanded: boolean;
  contentVisible: boolean;
  prerequisites: string[];
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
}) {
  return (
    <div
      className="absolute top-0 bottom-0 z-30 overflow-x-hidden p-3 pr-[5.5rem]"
      style={{
        left: 64,
        right: 0,
        background: WASH_COLOR,
        transformOrigin: "left center",
        transform: expanded ? "scaleX(1)" : "scaleX(0)",
        pointerEvents: expanded && contentVisible ? "auto" : "none",
        transition: `transform ${EXPAND_MS}ms ${EASE}`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="flex h-full flex-col gap-2 overflow-y-auto"
        style={{
          opacity: contentVisible ? 1 : 0,
          transition: `opacity ${PREREQ_CONTENT_FADE_MS}ms ${EASE}`,
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8a7a68]">
          Prerequisites{" "}
          <span className="normal-case tracking-normal">- OPTIONAL</span>
        </p>
        {prerequisites.map((value, index) => (
          <input
            key={`prereq-${index}`}
            value={value}
            aria-label={`Prerequisite ${index + 1}`}
            placeholder="Prerequisite task code"
            className="w-full rounded border border-[rgba(200,146,42,0.3)] bg-[#fffaf2] px-2 py-1 text-[11px] font-semibold uppercase tracking-[1.32px] text-[#8a7a68] outline-none placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-[rgba(138,122,104,0.55)]"
            onChange={(e) => onChange(index, e.target.value)}
          />
        ))}
        <button
          type="button"
          aria-label="Add prerequisite"
          className="inline-flex h-5 w-[4.375rem] items-center justify-center rounded-full text-[9px] font-semibold uppercase tracking-wider text-white transition hover:brightness-95 active:brightness-90"
          style={{
            backgroundImage:
              "linear-gradient(151deg, rgb(252, 221, 166) 0%, rgb(200, 146, 42) 100%)",
            boxShadow: "0px 2px 8px 0px rgba(200, 146, 42, 0.35)",
          }}
          onClick={onAdd}
        >
          + More
        </button>
      </div>
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
      : action === "accept"
        ? "ACCEPT"
        : action === "approve"
          ? "PASS"
          : action === "dismiss" || action === "undo"
            ? "UNDO"
            : "CHECK";
  const ariaLabel =
    action === "claim"
      ? "Claim reward"
      : action === "accept"
        ? "Accept requested task"
        : action === "approve"
          ? "Pass task"
          : action === "dismiss"
            ? "Cancel request or dismiss pending task"
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
  const requested = status === "requested";
  const available = !status || status === "available";
  let action: TaskCardAction | null = null;
  let doneLook = claimed;

  if (!locked) {
    if (isChild) {
      if (requested) action = "dismiss";
      else if (available) action = "complete";
      else if (pending) action = "dismiss";
      else if (verified) action = "claim";
      else if (claimed) doneLook = true;
    } else if (requested) {
      action = "accept";
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

  function forceOpen() {
    clearTimer();
    setPhase("open");
  }

  return {
    phase,
    sidesGone,
    detailsOpen,
    useExpandedCopy,
    labelOpacity,
    toggle,
    collapse: startClose,
    forceOpen,
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

const CREATE_REVEAL_MS = 500;
const CREATE_REVEAL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/** Existing-task edit morph (fade → height → reveal). */
const EDIT_MORPH_FADE_MS = 280;
const EDIT_MORPH_HEIGHT_MS = 500;
const EDIT_MORPH_REVEAL_MS = 500;
/** Fallback only when measurement fails. */
const EDIT_CARD_H_FALLBACK = 280;

/**
 * Read the card's natural content height while it is height-locked.
 * Temporarily unlocks without transition, measures, then restores `lockedH`
 * so React can animate to the measured target next.
 */
function measureNaturalCardHeight(
  el: HTMLElement,
  lockedH: number,
  fallback: number,
): number {
  const prevTransition = el.style.transition;
  const expanders = Array.from(
    el.querySelectorAll<HTMLElement>("[data-expanding-body]"),
  );
  const prevExpanderMax = expanders.map((node) => node.style.maxHeight);

  el.style.transition = "none";
  el.style.height = "auto";
  el.style.minHeight = "0";
  el.style.maxHeight = "none";
  for (const node of expanders) node.style.maxHeight = "none";
  void el.offsetHeight;
  const measured = Math.ceil(el.getBoundingClientRect().height) || fallback;

  el.style.height = `${lockedH}px`;
  el.style.minHeight = `${lockedH}px`;
  el.style.maxHeight = `${lockedH}px`;
  expanders.forEach((node, i) => {
    node.style.maxHeight = prevExpanderMax[i] ?? "";
  });
  void el.offsetHeight;
  el.style.transition = prevTransition;

  return measured;
}

function createContentRevealStyle(revealed: boolean): CSSProperties {
  return {
    opacity: revealed ? 1 : 0,
    transition: `opacity ${CREATE_REVEAL_MS}ms ${CREATE_REVEAL_EASE}`,
    pointerEvents: revealed ? undefined : "none",
  };
}

function createSidebarRevealStyle(revealed: boolean): CSSProperties {
  return {
    opacity: revealed ? 1 : 0,
    transform: revealed ? "translateX(0)" : "translateX(-100%)",
    transition: `opacity ${CREATE_REVEAL_MS}ms ${CREATE_REVEAL_EASE}, transform ${CREATE_REVEAL_MS}ms ${CREATE_REVEAL_EASE}`,
    pointerEvents: revealed ? undefined : "none",
  };
}

function editMorphFadeStyle(opacity: number, ms = EDIT_MORPH_REVEAL_MS): CSSProperties {
  return {
    opacity,
    transition: `opacity ${ms}ms ${CREATE_REVEAL_EASE}`,
    pointerEvents: opacity < 1 ? "none" : undefined,
  };
}
const exitStyle = (gone: boolean): CSSProperties => ({
  opacity: gone ? 0 : 1,
  transform: gone ? "translateX(-120%)" : "translateX(0)",
  transition: `opacity ${EXIT_MS}ms ${EASE}, transform ${EXIT_MS}ms ${EASE}, width ${EXIT_MS}ms ${EASE}, min-width ${EXIT_MS}ms ${EASE}`,
  pointerEvents: gone ? "none" : "auto",
});

/** Reserved width so compact title/lead clears the absolute action rail. */
const ACTION_RAIL_PR = "pr-[5.75rem]";
/** Wider rail when parent pen/trash or save/cancel circles are shown. */
const PARENT_EDIT_RAIL_PR = "pr-[5.5rem]";
const REWARDS_RAIL_PR = "pr-14";
/** Shared Basic (sliders) / Advance (details textarea) slot — keeps edit card height stable. */
const EDIT_BOTTOM_SLOT_H = 107;
const EDIT_MODE_SWAP_MS = 500;
const EDIT_MODE_SWAP_HALF = EDIT_MODE_SWAP_MS / 2;
const EDIT_INPUT_SHELL =
  "rounded border border-[rgba(200,146,42,0.3)] bg-[#fffaf2]";

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
  expandInstant = false,
}: {
  paragraphs: string[];
  compactLine: string;
  detailsOpen: boolean;
  useExpandedCopy: boolean;
  labelOpacity: number;
  phase: Phase;
  /** Inset lead (and compact mode) to clear the action rail — same width as title. */
  reserveRail?: string;
  /** Skip internal height tween (used while card shell morphs height). */
  expandInstant?: boolean;
}) {
  // Expanded: lead stays PhaseLabel only; Aim + body are separate.
  const leadText = useExpandedCopy
    ? paragraphs[0] || compactLine
    : compactLine || paragraphs[0] || "";
  const bodyParas = useExpandedCopy ? paragraphs.slice(1) : [];
  const innerRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState(COLLAPSED_BODY_H);
  const wasExpandedRef = useRef(false);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    if (!detailsOpen) {
      wasExpandedRef.current = false;
      setMaxH((h) => (h === COLLAPSED_BODY_H ? h : COLLAPSED_BODY_H));
      return;
    }

    const target = el.scrollHeight;

    // Instant morph exit, or already open — sync height only (no collapse jump).
    if (expandInstant || wasExpandedRef.current) {
      wasExpandedRef.current = true;
      setMaxH((h) => (h === target ? h : target));
      return;
    }

    wasExpandedRef.current = true;
    setMaxH(COLLAPSED_BODY_H);
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => setMaxH(target));
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
    };
  }, [detailsOpen, leadText, useExpandedCopy, paragraphs, expandInstant]);

  return (
    <div
      data-expanding-body
      className="mt-0.5"
      style={{
        maxHeight: maxH,
        overflow: "hidden",
        transition: expandInstant
          ? undefined
          : `max-height ${EXPAND_MS}ms ${detailsOpen ? HEIGHT_EASE : EASE}`,
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
  onUpdate,
  onCreate,
  onCancelCreate,
  creating = false,
  creatingEmbedded = false,
  createContentRevealed = true,
  createSidebarRevealed = true,
  onRemove,
  busy = false,
  celebrate = false,
  onCelebrateDone,
  onCelebrateFadeStart,
  removing = false,
  onRemoveFadeStart,
  onRemoveDone,
}: TaskCardProps) {
  const [editing, setEditing] = useState(creating);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [editSwapOpacity, setEditSwapOpacity] = useState(1);
  const advanceSwapTimerRef = useRef<number | null>(null);
  const [prereqPanelOpen, setPrereqPanelOpen] = useState(false);
  const [prereqStripOpen, setPrereqStripOpen] = useState(false);
  const [prereqPanelExpanded, setPrereqPanelExpanded] = useState(false);
  const [prereqPanelContentVisible, setPrereqPanelContentVisible] =
    useState(false);
  const prereqPanelTimerRef = useRef<number | null>(null);
  const prereqPanelCollapseTimerRef = useRef<number | null>(null);
  const [draft, setDraft] = useState<TaskUpdatePatch | null>(
    creating ? emptyDraft() : null,
  );
  const [catalogLookupLoading, setCatalogLookupLoading] = useState(false);
  const [catalogMatch, setCatalogMatch] = useState<Task | null>(null);
  const [loadedFromCatalogId, setLoadedFromCatalogId] = useState<string | null>(
    null,
  );
  const novelTaskNoRef = useRef<string | null>(null);
  const novelSnapshotRef = useRef<string | null>(null);
  const novelModifiedRef = useRef(false);
  const [deleteRitual, setDeleteRitual] = useState(false);
  const [deleteClosing, setDeleteClosing] = useState(false);
  const [removeFading, setRemoveFading] = useState(false);
  const [celebrateFading, setCelebrateFading] = useState(false);
  const [celebrateContentGone, setCelebrateContentGone] = useState(false);
  const [logRevealed, setLogRevealed] = useState(false);
  const logFlipBusy = useRef(false);
  const removeDoneRef = useRef(false);
  const onRemoveFadeStartRef = useRef(onRemoveFadeStart);
  const onRemoveDoneRef = useRef(onRemoveDone);
  onRemoveFadeStartRef.current = onRemoveFadeStart;
  onRemoveDoneRef.current = onRemoveDone;
  const cardRef = useRef<HTMLElement | null>(null);
  const editMorphTimers = useRef<number[]>([]);
  /** View chrome opacity while morphing into/out of edit. */
  const [viewFade, setViewFade] = useState(1);
  /** Edit chrome opacity while morphing into/out of edit. */
  const [editFade, setEditFade] = useState(creating ? 1 : 0);
  /** Sidebar slide for edit enter-from-expanded / edit exit. */
  const [editSidebarIn, setEditSidebarIn] = useState(creating);
  const [editFromExpanded, setEditFromExpanded] = useState(false);
  const [editMorphing, setEditMorphing] = useState(false);
  const [shellMaxH, setShellMaxH] = useState<number | null>(null);
  /** Only true while intentionally tweening shell height (avoids unlock “second” anim). */
  const [shellHeightAnim, setShellHeightAnim] = useState(false);
  /** Instant-expand ExpandingBody while shell morphs after save/cancel. */
  const [expandInstant, setExpandInstant] = useState(false);
  /** Bumps when exit morph needs a post-commit height measure. */
  const [exitMeasureNonce, setExitMeasureNonce] = useState(0);
  const exitMeasureFromHRef = useRef<number | null>(null);

  const detail = task ? detailForTask(task) : null;
  const interactiveBlocked =
    celebrate ||
    deleteRitual ||
    deleteClosing ||
    removing ||
    editing ||
    editMorphing;
  const canExpand =
    Boolean(detail) && !locked && !interactiveBlocked;

  useEffect(() => {
    if (!celebrate) {
      setCelebrateFading(false);
      setCelebrateContentGone(false);
    }
  }, [celebrate]);

  useEffect(() => {
    if (!editing || !draft) {
      setCatalogLookupLoading(false);
      setCatalogMatch(null);
      return;
    }

    const trimmed = normalizeTaskNo(draft.task_no);
    if (trimmed.length < TASK_NO_LOOKUP_MIN) {
      setCatalogLookupLoading(false);
      setCatalogMatch(null);
      return;
    }

    const controller = new AbortController();
    setCatalogLookupLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/tasks?lookup=${encodeURIComponent(trimmed)}`,
            { signal: controller.signal, credentials: "same-origin" },
          );
          if (!res.ok || controller.signal.aborted) return;
          const data = (await res.json()) as { task: Task | null };
          if (controller.signal.aborted) return;
          const match = data.task;
          setCatalogMatch(match);
          if (!match) {
            if (novelTaskNoRef.current !== trimmed) {
              novelTaskNoRef.current = trimmed;
              novelSnapshotRef.current = serializeDraftForSeed(draft);
              novelModifiedRef.current = false;
            }
          } else {
            novelTaskNoRef.current = null;
            novelSnapshotRef.current = null;
            novelModifiedRef.current = false;
          }
        } catch {
          if (!controller.signal.aborted) setCatalogMatch(null);
        } finally {
          if (!controller.signal.aborted) setCatalogLookupLoading(false);
        }
      })();
    }, TASK_NO_LOOKUP_DEBOUNCE_MS);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [editing, draft?.task_no]);

  useEffect(() => {
    if (!editing || !draft || !novelSnapshotRef.current || !novelTaskNoRef.current) {
      return;
    }
    if (normalizeTaskNo(draft.task_no) !== novelTaskNoRef.current) return;
    if (serializeDraftForSeed(draft) !== novelSnapshotRef.current) {
      novelModifiedRef.current = true;
    }
  }, [editing, draft]);

  useEffect(() => {
    return () => {
      if (advanceSwapTimerRef.current != null) {
        window.clearTimeout(advanceSwapTimerRef.current);
      }
      if (prereqPanelTimerRef.current != null) {
        window.clearTimeout(prereqPanelTimerRef.current);
      }
      if (prereqPanelCollapseTimerRef.current != null) {
        window.clearTimeout(prereqPanelCollapseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!prereqPanelOpen) {
      setPrereqPanelExpanded(false);
      setPrereqPanelContentVisible(false);
      return;
    }
    setPrereqPanelContentVisible(false);
    const raf = window.requestAnimationFrame(() => setPrereqPanelExpanded(true));
    const contentTimer = window.setTimeout(
      () => setPrereqPanelContentVisible(true),
      EXPAND_MS,
    );
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(contentTimer);
    };
  }, [prereqPanelOpen]);

  useEffect(() => {
    if (!removing) {
      setRemoveFading(false);
      removeDoneRef.current = false;
      return;
    }
    setRemoveFading(true);
    onRemoveFadeStartRef.current?.();
    const t = window.setTimeout(() => {
      if (!removeDoneRef.current) {
        removeDoneRef.current = true;
        onRemoveDoneRef.current?.();
      }
    }, CELEBRATE_FADE_MS);
    return () => window.clearTimeout(t);
  }, [removing]);

  const {
    phase,
    sidesGone,
    detailsOpen,
    useExpandedCopy,
    labelOpacity,
    toggle,
    collapse,
    forceOpen,
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
  const requested = status === "requested";
  const unmetHints = (lockHints ?? []).filter(Boolean);
  const canParentEdit =
    !isChild &&
    !celebrate &&
    !removing &&
    (creating ||
      (parentCanEditStatus(status) && Boolean(onUpdate || onRemove)));
  const compactTitle =
    (editing && draft ? draft.category : null) ||
    task.category ||
    task.title ||
    task.task_no;
  const compactSubtitle =
    locked && !editing
      ? null
      : requested
        ? isChild
          ? "Waiting for mentor Accept"
          : "Mentee requested — Accept to approve"
        : pending && isChild
          ? "Pending Mentor Review"
          : verified && isChild
            ? "Claim to Complete"
            : verified && !isChild
              ? "Marked as Passed"
              : (editing && draft
                  ? draft.description
                  : task.description) || null;
  const showDeleteChrome = deleteRitual || deleteClosing;
  const showAction = !locked && !editing && !showDeleteChrome && Boolean(action || doneLook);
  const parentLockedView = locked && !isChild;
  const showRewards = !parentLockedView;
  const displayTitle =
    useExpandedCopy && detail && !editing
      ? detail.fullTitle
      : compactTitle;
  const railPad =
    canParentEdit || editing ? PARENT_EDIT_RAIL_PR : ACTION_RAIL_PR;

  function resetCatalogEditState() {
    setCatalogLookupLoading(false);
    setCatalogMatch(null);
    setLoadedFromCatalogId(null);
    novelTaskNoRef.current = null;
    novelSnapshotRef.current = null;
    novelModifiedRef.current = false;
  }

  function clearAdvanceSwapTimer() {
    if (advanceSwapTimerRef.current != null) {
      window.clearTimeout(advanceSwapTimerRef.current);
      advanceSwapTimerRef.current = null;
    }
  }

  function resetEditSwapState() {
    clearAdvanceSwapTimer();
    setEditSwapOpacity(1);
    closePrereqPanel();
  }

  function clearPrereqPanelTimers() {
    if (prereqPanelTimerRef.current != null) {
      window.clearTimeout(prereqPanelTimerRef.current);
      prereqPanelTimerRef.current = null;
    }
    if (prereqPanelCollapseTimerRef.current != null) {
      window.clearTimeout(prereqPanelCollapseTimerRef.current);
      prereqPanelCollapseTimerRef.current = null;
    }
  }

  function closePrereqPanel() {
    clearPrereqPanelTimers();
    setPrereqStripOpen(false);
    setPrereqPanelContentVisible(false);
    setPrereqPanelExpanded(false);
    setPrereqPanelOpen(false);
  }

  function togglePrereqPanel() {
    if (prereqPanelOpen) {
      setPrereqStripOpen(false);
      setPrereqPanelContentVisible(false);
      clearPrereqPanelTimers();
      prereqPanelTimerRef.current = window.setTimeout(() => {
        setPrereqPanelExpanded(false);
        prereqPanelCollapseTimerRef.current = window.setTimeout(() => {
          setPrereqPanelOpen(false);
          prereqPanelCollapseTimerRef.current = null;
        }, EXPAND_MS);
        prereqPanelTimerRef.current = null;
      }, PREREQ_CONTENT_FADE_MS);
      return;
    }
    setPrereqStripOpen(true);
    setPrereqPanelOpen(true);
  }

  function updatePrereq(index: number, value: string) {
    if (!draft) return;
    const next = [...draft.prerequisites];
    next[index] = value;
    setDraft({ ...draft, prerequisites: next });
  }

  function addPrereqSlot() {
    if (!draft) return;
    setDraft({ ...draft, prerequisites: [...draft.prerequisites, ""] });
  }

  function toggleAdvanceMode() {
    if (editSwapOpacity < 1) return;
    closePrereqPanel();
    clearAdvanceSwapTimer();
    setEditSwapOpacity(0);
    advanceSwapTimerRef.current = window.setTimeout(() => {
      setAdvanceOpen((v) => !v);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setEditSwapOpacity(1));
      });
      advanceSwapTimerRef.current = null;
    }, EDIT_MODE_SWAP_HALF);
  }

  const editSwapFadeStyle: CSSProperties = {
    opacity: editSwapOpacity,
    transition: `opacity ${EDIT_MODE_SWAP_HALF}ms ${EASE}`,
    pointerEvents: editSwapOpacity < 1 ? "none" : undefined,
  };

  function clearEditMorphTimers() {
    for (const id of editMorphTimers.current) window.clearTimeout(id);
    editMorphTimers.current = [];
  }

  function afterEditMorph(ms: number, fn: () => void) {
    editMorphTimers.current.push(window.setTimeout(fn, ms));
  }

  useEffect(() => {
    return () => clearEditMorphTimers();
  }, []);

  // After cancel/save swaps back to expanded view, measure once layout + ExpandingBody
  // have settled, then animate shell height to that exact target (single tween).
  useLayoutEffect(() => {
    if (exitMeasureFromHRef.current == null || editing) return;
    const fromH = exitMeasureFromHRef.current;

    let cancelled = false;
    let innerRaf = 0;
    const outerRaf = window.requestAnimationFrame(() => {
      innerRaf = window.requestAnimationFrame(() => {
        if (cancelled) return;
        if (exitMeasureFromHRef.current == null) return;
        exitMeasureFromHRef.current = null;
        const el = cardRef.current;
        const targetH = el
          ? measureNaturalCardHeight(el, fromH, fromH)
          : fromH;
        setShellHeightAnim(true);
        setShellMaxH(targetH);

        afterEditMorph(EDIT_MORPH_HEIGHT_MS, () => {
          setViewFade(1);
          afterEditMorph(EDIT_MORPH_REVEAL_MS, () => {
            setShellHeightAnim(false);
            setShellMaxH(null);
            setExpandInstant(false);
            setEditMorphing(false);
            setEditFromExpanded(false);
          });
        });
      });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(outerRaf);
      window.cancelAnimationFrame(innerRaf);
    };
  }, [exitMeasureNonce, editing]);

  function beginEdit() {
    if (creating || editMorphing || editing) return;
    const fromExpanded = detailsOpen;
    const fromH = cardRef.current?.offsetHeight ?? (fromExpanded ? 320 : 82);
    setEditMorphing(true);
    setEditFromExpanded(fromExpanded);
    clearEditMorphTimers();
    setShellHeightAnim(false);
    // Lock current height so the later content swap can't collapse the card.
    setShellMaxH(fromH);
    setViewFade(0);

    afterEditMorph(EDIT_MORPH_FADE_MS, () => {
      resetCatalogEditState();
      resetEditSwapState();
      setDraft(draftFromTask(task!));
      setAdvanceOpen(false);
      setEditing(true);
      setEditFade(0);
      // Collapsed: sidebar already present — keep it. Expanded: slide in on reveal.
      setEditSidebarIn(!fromExpanded);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = cardRef.current;
          const targetH = el
            ? measureNaturalCardHeight(el, fromH, EDIT_CARD_H_FALLBACK)
            : EDIT_CARD_H_FALLBACK;
          setShellHeightAnim(true);
          setShellMaxH(targetH);

          afterEditMorph(EDIT_MORPH_HEIGHT_MS, () => {
            setEditFade(1);
            if (fromExpanded) setEditSidebarIn(true);
            afterEditMorph(EDIT_MORPH_REVEAL_MS, () => {
              setShellHeightAnim(false);
              setShellMaxH(null);
              setEditMorphing(false);
            });
          });
        });
      });
    });
  }

  function finishEditToExpanded() {
    const fromH = cardRef.current?.offsetHeight ?? EDIT_CARD_H_FALLBACK;
    setEditMorphing(true);
    clearEditMorphTimers();
    setShellHeightAnim(false);
    setShellMaxH(fromH);
    setEditFade(0);
    setEditSidebarIn(false);
    setExpandInstant(true);

    afterEditMorph(EDIT_MORPH_REVEAL_MS, () => {
      exitMeasureFromHRef.current = fromH;
      setEditing(false);
      setAdvanceOpen(false);
      setDraft(null);
      resetCatalogEditState();
      resetEditSwapState();
      forceOpen();
      setViewFade(0);
      setExitMeasureNonce((n) => n + 1);
    });
  }

  function cancelEdit() {
    if (creating) {
      onCancelCreate?.();
      return;
    }
    if (editMorphing) return;
    finishEditToExpanded();
  }

  function loadCatalogIntoDraft() {
    if (!draft || !catalogMatch || catalogLookupLoading) return;
    setDraft(draftFromCatalogTask(catalogMatch, catalogMatch.task_no));
    setLoadedFromCatalogId(catalogMatch.id);
    novelTaskNoRef.current = null;
    novelSnapshotRef.current = null;
    novelModifiedRef.current = false;
    // Stay in Basic view so EXP/gem/icon remain editable without flipping to Advance.
    setAdvanceOpen(false);
  }

  async function saveEdit() {
    if (!draft) return;
    if (editMorphing && !creating) return;
    const { detail_aim, detail_body } = splitDetailExtras(draft.detail_extras);
    const trimmedNo = normalizeTaskNo(draft.task_no);
    if (!trimmedNo) {
      alert("Task code is required.");
      return;
    }
    let seed_catalog: boolean | undefined;
    if (loadedFromCatalogId) {
      seed_catalog = undefined;
    } else if (
      novelTaskNoRef.current &&
      trimmedNo === novelTaskNoRef.current
    ) {
      seed_catalog = !novelModifiedRef.current;
    } else if (!catalogMatch && trimmedNo.length >= TASK_NO_LOOKUP_MIN) {
      seed_catalog = true;
    }
    const patch: TaskSavePayload = {
      task_no: draft.task_no,
      category: draft.category.trim() || (creating ? "" : task!.category),
      description: emptyToNull(draft.description ?? ""),
      exp: draft.exp,
      gem: draft.gem,
      icon_key: draft.icon_key ?? "target",
      detail_title: emptyToNull(draft.detail_title ?? ""),
      detail_lead: emptyToNull(draft.detail_lead ?? ""),
      detail_aim,
      detail_body,
      ...serializePrereqsForSave(draft.prerequisites),
      seed_catalog,
    };
    if (creating) {
      if (!onCreate) return;
      const ok = await onCreate(patch);
      if (ok === false) return;
      return;
    }
    if (!onUpdate) return;
    const ok = await onUpdate(patch);
    if (ok === false) return;
    finishEditToExpanded();
  }

  function beginDelete() {
    if (detailsOpen) collapse();
    setEditing(false);
    setDraft(null);
    setDeleteClosing(false);
    setDeleteRitual(true);
  }

  function cancelDelete() {
    if (deleteClosing || busy) return;
    setDeleteClosing(true);
  }

  function finishDeleteClose() {
    setDeleteRitual(false);
    setDeleteClosing(false);
  }

  // Locked cards: parents can still edit/remove when status allows.
  if (locked && !editing) {
    return (
      <article
        className={`relative flex min-h-[82px] overflow-hidden rounded-2xl shadow-[0px_2px_16px_0px_rgba(200,146,42,0.08)] ${
          parentLockedView
            ? "border border-[rgba(200,146,42,0.18)] bg-[rgba(255,250,242,0.9)]"
            : "border border-[rgba(200,146,42,0.08)] bg-[rgba(240,232,216,0.5)] opacity-70"
        } ${removeFading ? "opacity-0" : ""}`}
        style={{
          transition: removing
            ? `opacity ${CELEBRATE_FADE_MS}ms ease`
            : undefined,
        }}
      >
        <DeleteRitual
          active={showDeleteChrome}
          closing={deleteClosing}
          busy={busy}
          onCloseComplete={finishDeleteClose}
          onCancel={cancelDelete}
          onConfirm={async () => {
            await onRemove?.();
          }}
        />
        {canParentEdit && !(deleteRitual && !deleteClosing) ? (
          <div className="absolute top-0 right-0 z-30 flex h-[82px] flex-col items-end justify-start gap-1.5 py-3 pr-3">
            <div className="flex items-center gap-1.5">
              {onUpdate ? (
                <CircleIconButton
                  label="Edit task"
                  tone="purple"
                  disabled={busy}
                  onClick={beginEdit}
                >
                  <PencilIcon size={14} />
                </CircleIconButton>
              ) : null}
              {onRemove ? (
                <CircleIconButton
                  label="Remove task for mentee"
                  tone="red"
                  disabled={busy || deleteClosing}
                  onClick={beginDelete}
                >
                  <TrashIcon size={14} />
                </CircleIconButton>
              ) : null}
            </div>
          </div>
        ) : null}
        <div
          className="flex w-16 shrink-0 items-center justify-center"
          style={{
            backgroundColor: parentLockedView
              ? WASH_COLOR
              : "rgba(200,146,42,0.06)",
          }}
        >
          <TaskGlyph task={task} locked claimed={false} />
        </div>
        <div className={`min-w-0 flex-1 p-3 ${canParentEdit ? railPad : ""}`}>
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

  const fadingOut = celebrateFading || removeFading;

  return (
    <article
      ref={cardRef}
      className={`relative overflow-hidden ${
        creatingEmbedded
          ? "rounded-none border-0 bg-transparent shadow-none"
          : `rounded-2xl border border-[rgba(200,146,42,0.18)] shadow-[0px_2px_16px_0px_rgba(200,146,42,0.08)] ${
              celebrate ? "" : "bg-[rgba(255,250,242,0.9)]"
            }`
      } ${canExpand && !editing && !editMorphing ? "cursor-pointer" : ""}`}
      onClick={
        interactiveBlocked || editing
          ? undefined
          : toggle
      }
      aria-expanded={detailsOpen}
      style={{
        opacity: fadingOut ? 0 : 1,
        background: celebrate ? WASH_COLOR : undefined,
        minHeight:
          shellMaxH != null
            ? shellMaxH
            : creating && createContentRevealed
              ? 240
              : undefined,
        height: shellMaxH ?? undefined,
        maxHeight: shellMaxH ?? undefined,
        transition: [
          celebrate || removing
            ? `opacity ${CELEBRATE_FADE_MS}ms ease`
            : null,
          shellHeightAnim && shellMaxH != null
            ? `height ${EDIT_MORPH_HEIGHT_MS}ms ${CREATE_REVEAL_EASE}, max-height ${EDIT_MORPH_HEIGHT_MS}ms ${CREATE_REVEAL_EASE}, min-height ${EDIT_MORPH_HEIGHT_MS}ms ${CREATE_REVEAL_EASE}`
            : null,
        ]
          .filter(Boolean)
          .join(", ") || undefined,
        pointerEvents: celebrate || removing || editMorphing ? "none" : undefined,
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
      <DeleteRitual
        active={showDeleteChrome}
        closing={deleteClosing}
        busy={busy}
        onCloseComplete={finishDeleteClose}
        onCancel={cancelDelete}
        onConfirm={async () => {
          await onRemove?.();
        }}
      />

      <div
        style={{
          opacity: celebrateContentGone ? 0 : 1,
          // Instant hide under the opaque wash — a fade here flashes chrome.
          transition: undefined,
          pointerEvents: celebrateContentGone ? "none" : undefined,
        }}
        aria-hidden={celebrateContentGone || undefined}
      >
        {/* Fixed top-right rail. Hidden only while delete swipe is active
            (not while cancel-closing) so chrome snaps back with no fade. */}
        <div
          className="absolute top-0 right-0 z-30 flex min-h-[82px] flex-col items-end justify-between gap-1.5 py-3 pr-3"
          style={
            deleteRitual && !deleteClosing
              ? { opacity: 0, transition: "none", pointerEvents: "none" }
              : creating
                ? createContentRevealStyle(createContentRevealed)
                : editing
                  ? editMorphFadeStyle(editFade)
                  : {
                      ...editMorphFadeStyle(viewFade, EDIT_MORPH_FADE_MS),
                      ...(deleteClosing
                        ? { opacity: 1, transition: "none" }
                        : {}),
                    }
          }
          aria-hidden={deleteRitual && !deleteClosing ? true : undefined}
        >
          {editing ? (
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-1.5">
                <CircleIconButton
                  label="Save changes"
                  tone="green"
                  disabled={busy || editMorphing}
                  onClick={() => void saveEdit()}
                >
                  {busy ? (
                    <SpinnerIcon size={14} />
                  ) : (
                    <CheckIcon size={14} />
                  )}
                </CircleIconButton>
                <CircleIconButton
                  label="Cancel edit"
                  tone="red"
                  disabled={busy || editMorphing}
                  onClick={cancelEdit}
                >
                  <CloseIcon size={14} />
                </CircleIconButton>
              </div>
              <button
                type="button"
                className="inline-flex h-5 w-[4.375rem] items-center justify-center rounded-full text-[9px] font-semibold uppercase tracking-wider text-white transition hover:brightness-95 active:brightness-90"
                style={{
                  backgroundImage:
                    "linear-gradient(151deg, rgb(252, 221, 166) 0%, rgb(200, 146, 42) 100%)",
                  boxShadow: "0px 2px 8px 0px rgba(200, 146, 42, 0.35)",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAdvanceMode();
                }}
                disabled={editSwapOpacity < 1}
              >
                {advanceOpen ? "Basic" : "Advance"}
              </button>
            </div>
          ) : (
            <>
              <div
                className={!showRewards ? "pointer-events-none invisible" : undefined}
                aria-hidden={!showRewards || undefined}
              >
                {showRewards ? (
                  <Rewards exp={task.exp} gem={task.gem} />
                ) : null}
              </div>
              <div className="flex items-center gap-1.5">
                {canParentEdit && onUpdate ? (
                  <CircleIconButton
                    label="Edit task"
                    tone="purple"
                    disabled={busy || editMorphing}
                    onClick={beginEdit}
                  >
                    <PencilIcon size={14} />
                  </CircleIconButton>
                ) : null}
                {canParentEdit && onRemove && !creating ? (
                  <CircleIconButton
                    label="Remove task for mentee"
                    tone="red"
                    disabled={busy || deleteClosing}
                    onClick={beginDelete}
                  >
                    <TrashIcon size={14} />
                  </CircleIconButton>
                ) : null}
                {showAction ? (
                  <ActionButton
                    action={action}
                    doneLook={doneLook}
                    busy={busy}
                    onAction={onAction}
                  />
                ) : null}
              </div>
            </>
          )}
        </div>

        <div
          className={`flex items-start overflow-hidden${
            creating && creatingEmbedded ? " relative" : ""
          }`}
        >
          <div
            className={`flex w-16 shrink-0 flex-col items-center justify-center gap-1.5 overflow-hidden py-2${
              creating && creatingEmbedded ? " absolute top-0 bottom-0 left-0 z-10" : ""
            }`}
            style={{
              backgroundColor: WASH_COLOR,
              ...(creating
                ? {
                    ...createSidebarRevealStyle(createSidebarRevealed),
                    width: 64,
                    minWidth: 64,
                  }
                : editing
                  ? editFromExpanded || !editSidebarIn
                    ? {
                        ...createSidebarRevealStyle(editSidebarIn),
                        width: 64,
                        minWidth: 64,
                      }
                    : {
                        width: 64,
                        minWidth: 64,
                        opacity: 1,
                      }
                  : expandInstant
                    ? {
                        // Exit morph: snap sidebar away so height measure matches final layout.
                        width: 0,
                        minWidth: 0,
                        opacity: 0,
                        overflow: "hidden",
                        transition: "none",
                        pointerEvents: "none",
                      }
                    : {
                        ...exitStyle(sidesGone),
                        width: sidesGone ? 0 : 64,
                        minWidth: sidesGone ? 0 : 64,
                      }),
              alignSelf: "stretch",
              minHeight: 82,
            }}
          >
            {editing && draft ? (
              <div
                className="flex h-full w-full items-center justify-center"
                style={!creating ? editMorphFadeStyle(editFade) : undefined}
              >
                <div
                  className="flex h-full w-full items-center justify-center"
                  style={editSwapFadeStyle}
                >
                {advanceOpen ? (
                  <PrereqSidebarStrip
                    count={filledPrereqCount(draft.prerequisites)}
                    open={prereqStripOpen}
                    onToggle={togglePrereqPanel}
                  />
                ) : (
                  <div
                    className="flex flex-col items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {ICON_OPTIONS.map((key) => {
                      const selected =
                        (draft.icon_key ?? defaultIconKeyForTask(task)) === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-label={`Icon ${key}`}
                          aria-pressed={selected}
                          className={`rounded-lg p-1 transition ${
                            selected
                              ? "bg-[rgba(200,146,42,0.45)] shadow-[0px_1px_4px_0px_rgba(200,146,42,0.25)]"
                              : "opacity-40 hover:opacity-100"
                          }`}
                          onClick={() =>
                            setDraft({ ...draft, icon_key: key })
                          }
                        >
                          <GlyphByKey
                            iconKey={key}
                            size={22}
                            className="text-gold"
                          />
                        </button>
                      );
                    })}
                  </div>
                )}
                </div>
              </div>
            ) : (
              <div
                style={
                  !creating
                    ? editMorphFadeStyle(viewFade, EDIT_MORPH_FADE_MS)
                    : undefined
                }
              >
                <TaskGlyph
                  task={task}
                  locked={false}
                  claimed={claimed}
                  iconOverride={draft?.icon_key}
                />
              </div>
            )}
          </div>

          <div
            className="min-w-0 flex-1 p-3"
            style={
              creating
                ? {
                    ...(creatingEmbedded ? { marginLeft: 64 } : {}),
                    ...createContentRevealStyle(createContentRevealed),
                  }
                : editing
                  ? editMorphFadeStyle(editFade)
                  : editMorphFadeStyle(viewFade, EDIT_MORPH_FADE_MS)
            }
          >
            {editing && draft ? (
              <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                <div className={`space-y-2 ${PARENT_EDIT_RAIL_PR}`}>
                  <div className="relative">
                    <input
                      value={draft.task_no}
                      aria-label="Task code"
                      placeholder="Task Code (Recognizable)"
                      className="w-full rounded border border-[rgba(200,146,42,0.3)] bg-[#fffaf2] py-1 pl-2 pr-8 text-[11px] font-semibold uppercase tracking-[1.32px] text-[#8a7a68] outline-none placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-[rgba(138,122,104,0.55)]"
                      onChange={(e) => {
                        setLoadedFromCatalogId(null);
                        setDraft({ ...draft, task_no: e.target.value });
                      }}
                    />
                    {catalogLookupLoading ||
                    (catalogMatch && catalogMatch.id !== task.id) ? (
                      <button
                        type="button"
                        aria-label={
                          catalogLookupLoading
                            ? "Looking up task code"
                            : "Load catalog details for this task code"
                        }
                        aria-busy={catalogLookupLoading || undefined}
                        disabled={catalogLookupLoading || !catalogMatch}
                        title={
                          catalogLookupLoading
                            ? "Looking up…"
                            : "Load shared catalog details"
                        }
                        className="absolute top-1/2 right-1 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full transition enabled:hover:bg-[rgba(200,146,42,0.12)] disabled:cursor-default"
                        onClick={() => loadCatalogIntoDraft()}
                      >
                        {catalogLookupLoading ? (
                          <SpinnerIcon size={14} className="text-gold" />
                        ) : (
                          <ImportIcon
                            size={14}
                            className="text-[rgba(200,146,42,0.85)]"
                          />
                        )}
                      </button>
                    ) : null}
                  </div>
                  <div className={EDIT_INPUT_SHELL}>
                    <div style={editSwapFadeStyle}>
                      {advanceOpen ? (
                        <input
                          value={draft.detail_title ?? ""}
                          aria-label="Detail title"
                          placeholder="Longer Title (Optional)"
                          className="w-full border-0 bg-transparent px-2 py-1 text-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-[rgba(138,122,104,0.55)]"
                          onChange={(e) =>
                            setDraft({ ...draft, detail_title: e.target.value })
                          }
                        />
                      ) : (
                        <input
                          value={draft.category}
                          aria-label="Title"
                          placeholder="Task Title"
                          className="w-full border-0 bg-transparent px-2 py-1 text-sm font-semibold text-ink outline-none placeholder:font-normal placeholder:text-[rgba(138,122,104,0.55)]"
                          onChange={(e) =>
                            setDraft({ ...draft, category: e.target.value })
                          }
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div className={EDIT_INPUT_SHELL}>
                  <div style={editSwapFadeStyle}>
                    {advanceOpen ? (
                      <input
                        value={draft.detail_lead ?? ""}
                        aria-label="Detail lead"
                        placeholder="Longer Description Line (Optional)"
                        className="w-full border-0 bg-transparent px-2 py-1 text-xs leading-relaxed text-[#8a7a68] outline-none placeholder:text-[rgba(138,122,104,0.55)]"
                        onChange={(e) =>
                          setDraft({ ...draft, detail_lead: e.target.value })
                        }
                      />
                    ) : (
                      <input
                        value={draft.description ?? ""}
                        aria-label="Description"
                        placeholder="Description Line (Optional)"
                        className="w-full border-0 bg-transparent px-2 py-1 text-xs leading-relaxed text-[#8a7a68] outline-none placeholder:text-[rgba(138,122,104,0.55)]"
                        onChange={(e) =>
                          setDraft({ ...draft, description: e.target.value })
                        }
                      />
                    )}
                  </div>
                </div>
                <div
                  className="shrink-0"
                  style={{ height: EDIT_BOTTOM_SLOT_H }}
                >
                  {advanceOpen ? (
                    <div className="h-full" style={editSwapFadeStyle}>
                      <textarea
                        value={draft.detail_extras ?? ""}
                        aria-label="Detail extras"
                        placeholder="Details... (Optional)"
                        className="h-full w-full resize-none rounded border border-[rgba(200,146,42,0.3)] bg-[#fffaf2] px-2 py-1 text-xs leading-relaxed text-[rgba(28,22,16,0.72)] outline-none placeholder:text-[rgba(138,122,104,0.55)]"
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            detail_extras: e.target.value,
                          })
                        }
                      />
                    </div>
                  ) : (
                    <div
                      className="grid h-full grid-rows-2"
                      style={editSwapFadeStyle}
                    >
                      <SteppedRewardSlider
                        compact
                        kind="exp"
                        min={0}
                        max={40}
                        step={5}
                        value={draft.exp}
                        onChange={(exp) => setDraft({ ...draft, exp })}
                      />
                      <SteppedRewardSlider
                        compact
                        kind="gem"
                        min={0}
                        max={8}
                        step={1}
                        value={draft.gem}
                        onChange={(gem) => setDraft({ ...draft, gem })}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className={railPad}>
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
                    compactLine={compactSubtitle || detail.lead || ""}
                    detailsOpen={detailsOpen}
                    useExpandedCopy={useExpandedCopy}
                    labelOpacity={labelOpacity}
                    phase={phase}
                    reserveRail={railPad}
                    expandInstant={expandInstant}
                  />
                ) : compactSubtitle ? (
                  <p
                    className={`mt-0.5 truncate text-xs leading-[16.5px] text-[#8a7a68] ${railPad}`}
                  >
                    {compactSubtitle}
                  </p>
                ) : null}
                {locked && unmetHints.length > 0 ? (
                  <div className={railPad}>
                    {unmetHints.map((hint) => (
                      <p
                        key={hint}
                        className="mt-0.5 truncate text-xs leading-[16.5px] text-[#8a7a68]"
                      >
                        {hint}
                      </p>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
        {editing && draft && advanceOpen && prereqPanelOpen ? (
          <PrereqEditPanel
            expanded={prereqPanelExpanded}
            contentVisible={prereqPanelContentVisible}
            prerequisites={draft.prerequisites}
            onChange={updatePrereq}
            onAdd={addPrereqSlot}
          />
        ) : null}
      </div>
    </article>
  );
}
