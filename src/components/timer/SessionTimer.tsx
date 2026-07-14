"use client";

import {
  EnvironmentCheckPanel,
  type EnvironmentCheckHandle,
  type EnvironmentEvidencePayload,
} from "@/components/timer/EnvironmentalCheck";
import { DurationClock } from "@/components/ui/DurationClock";
import { BoltIcon } from "@/components/ui/Icons";
import { PartyPopBurst } from "@/components/ui/PartyPopBurst";
import { SwipeToEnter } from "@/components/ui/SwipeToEnter";
import { useSessionClock } from "@/hooks/useGeolocation";
import type { ActiveSessionState, Session } from "@/types";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

type SessionTimerProps = {
  isChild: boolean;
  active: ActiveSessionState | null;
  onActiveChange: (next: ActiveSessionState | null) => void;
};

const DRAG_THRESHOLD = 40;

const sheetShellClass =
  "fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[475px] rounded-t-[24px] bg-[rgba(255,250,242,0.97)] px-5 pb-6 pt-3 shadow-[0px_-4px_32px_0px_rgba(200,146,42,0.12)]";

export function SessionTimer({
  isChild,
  active,
  onActiveChange,
}: SessionTimerProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [phase, setPhase] = useState<"idle" | "start-check" | "end-check">(
    "idle",
  );
  const [tutorial, setTutorial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swipeKey, setSwipeKey] = useState(0);
  /** Finished session awaiting claim swipe (shown in the bottom sheet). */
  const [completed, setCompleted] = useState<Session | null>(null);
  /** Blocks kickstart/env-check render while ending session settles. */
  const [claimPending, setClaimPending] = useState(false);
  /** Session sheet collapsed to slim bar (active sessions only). */
  const [sheetCollapsed, setSheetCollapsed] = useState(false);

  const checkOpen = phase === "start-check" || phase === "end-check";
  const [dragDelta, setDragDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [checkNaturalHeight, setCheckNaturalHeight] = useState(180);
  const [activeBodyNaturalHeight, setActiveBodyNaturalHeight] = useState(220);

  const dragging = useRef(false);
  const didDrag = useRef(false);
  const startY = useRef(0);
  const dragDeltaRef = useRef(0);
  const checkOpenRef = useRef(checkOpen);
  const sheetCollapsedRef = useRef(sheetCollapsed);
  const checkInnerRef = useRef<HTMLDivElement>(null);
  const activeBodyInnerRef = useRef<HTMLDivElement>(null);
  const envRef = useRef<EnvironmentCheckHandle>(null);

  const elapsed = useSessionClock(
    active?.startedAt ?? null,
    active?.serverNow ?? null,
  );

  const requireEvidence = active
    ? Boolean(active && !active.isTutorial)
    : isChild || !tutorial;

  useEffect(() => {
    checkOpenRef.current = checkOpen;
  }, [checkOpen]);

  useEffect(() => {
    sheetCollapsedRef.current = sheetCollapsed;
  }, [sheetCollapsed]);

  useEffect(() => {
    const inner = checkInnerRef.current;
    if (!inner) return;
    const measure = () =>
      setCheckNaturalHeight(inner.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [checkOpen, requireEvidence, phase, active]);

  useEffect(() => {
    const inner = activeBodyInnerRef.current;
    if (!inner) return;
    const measure = () =>
      setActiveBodyNaturalHeight(Math.max(inner.scrollHeight, inner.getBoundingClientRect().height));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [checkOpen, sheetCollapsed, active, swipeKey]);

  function openCheck(next: "start-check" | "end-check") {
    setError(null);
    setSheetCollapsed(false);
    setPhase(next);
  }

  function closeCheck() {
    setPhase("idle");
    envRef.current?.reset();
    setSwipeKey((k) => k + 1);
  }

  async function startSession(payload: EnvironmentEvidencePayload) {
    setError(null);
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start",
        is_tutorial: tutorial,
        ...payload,
      }),
    });
    const data = (await res.json()) as {
      active?: ActiveSessionState;
      error?: string;
    };
    if (!res.ok || !data.active) throw new Error(data.error || "Start failed");
    onActiveChange(data.active);
    setPhase("idle");
    setSheetCollapsed(false);
    envRef.current?.reset();
  }

  async function endSession(payload: EnvironmentEvidencePayload) {
    // Freeze UI before the request lands so we never flash kickstart / env check.
    setClaimPending(true);
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end", ...payload }),
    });
    const data = (await res.json()) as { session?: Session; error?: string };
    if (!res.ok || !data.session) {
      setClaimPending(false);
      throw new Error(data.error || "End failed");
    }
    // Claim sheet first; clear active in the same turn so parent+child update together.
    setCompleted(data.session);
    setPhase("idle");
    setSheetCollapsed(false);
    setDragDelta(0);
    setIsDragging(false);
    setSwipeKey((k) => k + 1);
    setClaimPending(false);
    onActiveChange(null);
  }

  function claimCompleted() {
    setCompleted(null);
    setClaimPending(false);
    setSwipeKey((k) => k + 1);
    setError(null);
    startTransition(() => {
      router.refresh();
    });
  }

  async function onSwipeComplete() {
    setError(null);
    if (!active) {
      if (phase !== "start-check") {
        openCheck("start-check");
        return;
      }
      try {
        const payload = await envRef.current!.confirm();
        await startSession(payload);
      } catch (e) {
        if (e instanceof Error && e.message !== "location") {
          setError(e.message);
        }
        throw e;
      }
      return;
    }

    if (phase !== "end-check") {
      openCheck("end-check");
      return;
    }
    try {
      const payload = await envRef.current!.confirm();
      await endSession(payload);
    } catch (e) {
      if (e instanceof Error && e.message !== "location") {
        setError(e.message);
      }
      throw e;
    }
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

    if (sheetCollapsedRef.current) {
      // Compact bar: drag up to expand
      const next = Math.min(0, Math.max(-120, delta));
      dragDeltaRef.current = next;
      setDragDelta(next);
      return;
    }

    if (checkOpenRef.current) {
      // Env check open: drag down to tuck check
      const next = Math.max(0, Math.min(checkNaturalHeight, delta));
      dragDeltaRef.current = next;
      setDragDelta(next);
      return;
    }

    // Expanded session: drag down collapses sheet; drag up opens check
    if (active) {
      if (delta > 0) {
        const next = Math.max(0, Math.min(activeBodyNaturalHeight, delta));
        dragDeltaRef.current = next;
        setDragDelta(next);
      } else {
        const next = Math.min(0, Math.max(-checkNaturalHeight, delta));
        dragDeltaRef.current = next;
        setDragDelta(next);
      }
      return;
    }

    // Kickstart: drag up opens check
    const next = Math.min(0, Math.max(-checkNaturalHeight, delta));
    dragDeltaRef.current = next;
    setDragDelta(next);
  }

  function endDrag() {
    if (!dragging.current) return;
    dragging.current = false;
    setIsDragging(false);
    const offset = dragDeltaRef.current;

    if (sheetCollapsedRef.current) {
      if (offset <= -DRAG_THRESHOLD) setSheetCollapsed(false);
      dragDeltaRef.current = 0;
      setDragDelta(0);
      return;
    }

    if (checkOpenRef.current) {
      if (offset >= DRAG_THRESHOLD) closeCheck();
      dragDeltaRef.current = 0;
      setDragDelta(0);
      return;
    }

    if (active) {
      if (offset >= DRAG_THRESHOLD) {
        setSheetCollapsed(true);
        closeCheck();
      } else if (offset <= -DRAG_THRESHOLD) {
        openCheck("end-check");
      }
      dragDeltaRef.current = 0;
      setDragDelta(0);
      return;
    }

    if (offset <= -DRAG_THRESHOLD) openCheck("start-check");
    dragDeltaRef.current = 0;
    setDragDelta(0);
  }

  // ---- Derived heights / opacities ----
  const checkHeightResolved = (() => {
    if (checkOpen) {
      return Math.max(0, checkNaturalHeight - Math.max(0, dragDelta));
    }
    if (sheetCollapsed) return 0;
    if (active && dragDelta > 0) return 0; // collapsing sheet
    return Math.max(0, -dragDelta);
  })();

  const checkOpacity =
    checkNaturalHeight > 0
      ? Math.min(1, Math.max(0, checkHeightResolved / checkNaturalHeight))
      : checkOpen
        ? 1
        : 0;

  const activeBodyHeight = (() => {
    if (!active) return undefined;
    if (sheetCollapsed) {
      // peek open while dragging up from compact
      return Math.max(0, -dragDelta);
    }
    // collapsing: shrink body with downward drag
    if (!checkOpen && dragDelta > 0) {
      return Math.max(0, activeBodyNaturalHeight - dragDelta);
    }
    return activeBodyNaturalHeight;
  })();

  const activeBodyOpacity = (() => {
    if (!active) return 1;
    if (sheetCollapsed) {
      return Math.min(1, Math.max(0, -dragDelta / 80));
    }
    if (!checkOpen && dragDelta > 0) {
      return Math.max(
        0,
        1 - dragDelta / Math.max(activeBodyNaturalHeight, 1),
      );
    }
    return 1;
  })();

  const compactOpacity = (() => {
    if (!active) return 0;
    if (sheetCollapsed) {
      return Math.max(0, 1 - Math.min(1, -dragDelta / 80));
    }
    if (!checkOpen && dragDelta > 0) {
      return Math.min(1, dragDelta / Math.max(activeBodyNaturalHeight * 0.5, 1));
    }
    return 0;
  })();

  const sheetTransition = isDragging
    ? "none"
    : "height 0.4s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease";

  function renderHandle() {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={
          sheetCollapsed
            ? "Drag up or tap to expand session"
            : checkOpen
              ? "Drag down or tap to close environment check"
              : active
                ? "Drag down to collapse, or up for environment check"
                : "Drag up or tap to open environment check"
        }
        className="mb-2 flex cursor-grab touch-none justify-center active:cursor-grabbing"
        onClick={() => {
          if (didDrag.current) {
            didDrag.current = false;
            return;
          }
          if (sheetCollapsed) {
            setSheetCollapsed(false);
            return;
          }
          if (checkOpen) {
            closeCheck();
            return;
          }
          if (active) setSheetCollapsed(true);
          else openCheck("start-check");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (sheetCollapsed) setSheetCollapsed(false);
            else if (checkOpen) closeCheck();
            else if (active) setSheetCollapsed(true);
            else openCheck("start-check");
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
    );
  }

  function renderCheckPanel() {
    return (
      <div
        className="overflow-hidden"
        style={{
          height: checkHeightResolved,
          opacity: checkOpacity,
          transition: sheetTransition,
        }}
      >
        <div ref={checkInnerRef} className="pb-3">
          <EnvironmentCheckPanel
            key={phase}
            ref={envRef}
            requireEvidence={requireEvidence}
          />
        </div>
      </div>
    );
  }

  // -------- Session complete (claim in the same bottom sheet) --------
  if (completed || claimPending) {
    const exp = completed ? Number(completed.exp_earned).toFixed(1) : "…";
    return (
      <div className={`${sheetShellClass} relative overflow-visible`}>
        {completed ? <PartyPopBurst /> : null}

        <div className="mb-2 flex justify-center">
          <div className="h-1 w-8 rounded-full bg-[rgba(200,146,42,0.25)]" />
        </div>

        <h2 className="mb-4 flex items-center gap-2 pl-1 text-sm font-semibold uppercase tracking-[1.68px] text-[rgba(28,22,16,0.7)]">
          <span aria-hidden className="text-base leading-none">
            🎉
          </span>
          Session complete
        </h2>

        <div
          className="relative z-10 mb-5 flex flex-col items-center gap-2 rounded-2xl border border-[rgba(200,146,42,0.2)] px-8 py-5"
          style={{
            backgroundImage:
              "linear-gradient(158deg, rgba(252, 221, 166, 0.5) 0%, rgba(223, 238, 243, 0.4) 100%)",
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[1.76px] text-[#8a7a68]">
            You earned
          </p>
          <div className="flex items-end gap-2">
            <span className="font-serif text-[48px] leading-none text-gold">
              {exp}
            </span>
            <span className="mb-2 flex items-center gap-1 text-lg font-semibold text-gold">
              <BoltIcon size={20} />
              EXP
            </span>
          </div>
          <div className="h-px w-8 bg-[rgba(200,146,42,0.25)]" />
          <p className="flex items-center justify-center font-serif text-[36px] leading-none tracking-[2.16px] text-ink">
            <DurationClock
              totalSeconds={completed?.duration_seconds ?? elapsed}
            />
          </p>
          {completed?.is_tutorial ? (
            <p className="text-xs text-[#7b68ee]">Tutorial rate applied (×3)</p>
          ) : null}
        </div>

        {completed ? (
          <SwipeToEnter
            key={swipeKey}
            label="Swipe to Claim"
            onComplete={claimCompleted}
          />
        ) : (
          <p className="py-4 text-center text-sm text-[#8a7a68]">Wrapping up…</p>
        )}
      </div>
    );
  }

  // -------- Kickstart (no active session) --------
  if (!active) {
    return (
      <div className={sheetShellClass}>
        {renderHandle()}
        <div className="relative mb-2 h-5">
          <p
            className="absolute inset-x-0 text-xs font-semibold uppercase tracking-[1.68px] text-[#8a7a68] transition-opacity duration-300"
            style={{ opacity: checkOpacity > 0.5 ? 0 : 1 }}
          >
            Kickstart your session
          </p>
          <div
            className="absolute inset-x-0 flex items-center gap-2 transition-opacity duration-300"
            style={{ opacity: checkOpacity > 0.5 ? 1 : 0 }}
          >
            <p className="text-sm font-semibold uppercase tracking-[1.68px] text-[rgba(28,22,16,0.7)]">
              Environment check
            </p>
            <span className="rounded-full bg-[rgba(200,146,42,0.18)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
              Beta
            </span>
          </div>
        </div>
        {renderCheckPanel()}
        {!checkOpen && !isChild ? (
          <label className="mb-3 flex items-center gap-2 text-xs text-ink/70">
            <input
              type="checkbox"
              checked={tutorial}
              onChange={(e) => setTutorial(e.target.checked)}
              className="accent-gold"
            />
            Tutorial timer (3× EXP, no environment check)
          </label>
        ) : null}
        <SwipeToEnter
          key={swipeKey}
          label="Swipe to Start"
          onComplete={onSwipeComplete}
        />
        {error ? (
          <p className="mt-2 text-center text-sm text-red-600">{error}</p>
        ) : null}
      </div>
    );
  }

  // -------- Active session (one sheet, collapses smoothly) --------
  return (
    <div className={sheetShellClass}>
      {renderHandle()}

      {/* Always-present header — Session running stays put; small clock fades when expanded */}
      <button
        type="button"
        className={`mb-1 flex w-full items-center justify-between pl-1 text-left ${
          sheetCollapsed ? "cursor-pointer" : "cursor-default"
        }`}
        onClick={() => {
          if (sheetCollapsed) setSheetCollapsed(false);
        }}
        aria-label={sheetCollapsed ? "Expand session" : undefined}
        tabIndex={sheetCollapsed ? 0 : -1}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2 shrink-0 rounded-full bg-[#4caf50] shadow-[0_0_6px_#4caf50]" />
          <span className="truncate text-sm font-semibold uppercase tracking-[1.68px] text-[rgba(28,22,16,0.7)]">
            Session running
          </span>
          {active.isTutorial ? (
            <span className="rounded-full bg-lavender/50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
              ×3
            </span>
          ) : null}
          {checkOpen ? (
            <span className="shrink-0 rounded-full bg-[rgba(200,146,42,0.18)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">
              Beta
            </span>
          ) : null}
        </div>
        <span
          className="shrink-0"
          style={{
            opacity: compactOpacity,
            transition: isDragging ? "none" : "opacity 0.35s ease",
          }}
          aria-hidden={compactOpacity < 0.05}
        >
          <DurationClock
            totalSeconds={elapsed}
            className="font-serif text-lg leading-none tracking-[2.88px] text-gold"
          />
        </span>
      </button>

      {/* Expanded body — no duplicate title row */}
      <div
        className="overflow-hidden"
        style={{
          height: activeBodyHeight,
          opacity: sheetCollapsed ? activeBodyOpacity : activeBodyOpacity,
          transition: sheetTransition,
        }}
      >
        <div ref={activeBodyInnerRef}>
          <div
            style={{
              opacity: checkOpacity > 0.35 ? 0 : 1,
              maxHeight: checkOpacity > 0.35 ? 0 : 96,
              overflow: "hidden",
              transition: "opacity 0.3s ease, max-height 0.35s ease",
            }}
          >
            <p
              className="mb-3 flex items-center justify-center py-2 font-serif text-[48px] leading-none tracking-[2.88px] text-ink"
              aria-live="polite"
            >
              <DurationClock totalSeconds={elapsed} />
            </p>
          </div>

          {renderCheckPanel()}

          <SwipeToEnter
            key={swipeKey}
            label="Swipe to End"
            onComplete={onSwipeComplete}
          />
          {error ? (
            <p className="mt-2 text-center text-sm text-red-600">{error}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
