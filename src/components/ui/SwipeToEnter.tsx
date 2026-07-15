"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type SwipeToEnterProps = {
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  successLabel?: string;
  onComplete: () => void | Promise<void>;
};

/** Gap between resting thumb and the label’s left edge. */
const LABEL_THUMB_GAP = 12;

export function SwipeToEnter({
  label = "Swipe to Enter",
  disabled = false,
  loading = false,
  successLabel,
  onComplete,
}: SwipeToEnterProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLParagraphElement>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);
  const [entered, setEntered] = useState(false);
  /** Static label left (px); preferred center, else cleared past the thumb. */
  const [labelLeft, setLabelLeft] = useState<number | null>(null);
  const startX = useRef(0);
  const startOffset = useRef(0);
  const offsetRef = useRef(0);
  const draggingRef = useRef(false);

  const handleWidth = 80;
  const padding = 4;

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const showSuccess = done && Boolean(successLabel);
  const labelText = loading ? "Please wait…" : label;

  // Initial label seat only — does not follow the handle while swiping.
  useLayoutEffect(() => {
    if (showSuccess) return;

    function placeLabel() {
      const track = trackRef.current;
      const labelEl = labelRef.current;
      if (!track || !labelEl) return;
      const trackW = track.clientWidth;
      const labelW = labelEl.scrollWidth;
      if (trackW <= 0 || labelW <= 0) return;
      const thumbRight = padding + handleWidth;
      const minLeft = thumbRight + LABEL_THUMB_GAP;
      const centeredLeft = (trackW - labelW) / 2;
      setLabelLeft(Math.max(centeredLeft, minLeft));
    }

    placeLabel();
    const ro = new ResizeObserver(placeLabel);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, [labelText, showSuccess, handleWidth, padding]);

  function maxOffset() {
    const width = trackRef.current?.clientWidth ?? 360;
    return Math.max(0, width - handleWidth - padding * 2);
  }

  function setHandleOffset(next: number) {
    offsetRef.current = next;
    setOffset(next);
  }

  function begin(clientX: number) {
    if (disabled || loading || done) return;
    draggingRef.current = true;
    setDragging(true);
    startX.current = clientX;
    startOffset.current = offsetRef.current;
  }

  function move(clientX: number) {
    if (!draggingRef.current) return;
    const delta = clientX - startX.current;
    const next = Math.min(maxOffset(), Math.max(0, startOffset.current + delta));
    setHandleOffset(next);
  }

  function fadeInAgain() {
    setEntered(false);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => setEntered(true));
    });
  }

  function resetHandle() {
    setDone(false);
    setHandleOffset(0);
    fadeInAgain();
  }

  async function end() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    const current = offsetRef.current;
    const limit = maxOffset();
    const threshold = limit * 0.85;
    if (current >= threshold) {
      setHandleOffset(limit);
      setDone(true);
      try {
        await onComplete();
        // Soft reset so the handle never stays stuck at the end
        // (unless a permanent successLabel is shown).
        if (!successLabel) resetHandle();
      } catch {
        resetHandle();
      }
    } else {
      setHandleOffset(0);
    }
  }

  const journey = maxOffset() > 0 ? offset / maxOffset() : 0;
  // Label fades early; handle (+ icon) fades across the full travel
  const slideLabelOpacity = Math.max(0, 1 - journey / 0.25);
  const slideHandleOpacity = Math.max(0, 1 - journey);
  const labelOpacity = entered ? slideLabelOpacity : 0;
  const handleOpacity = entered && !showSuccess ? slideHandleOpacity : 0;

  return (
    <div
      ref={trackRef}
      className="relative h-14 w-full overflow-hidden rounded-full border border-[rgba(200,146,42,0.2)] shadow-[0px_2px_12px_0px_rgba(200,146,42,0.15)]"
      style={{
        backgroundImage: showSuccess
          ? "linear-gradient(90deg, #fcdda6 0%, #c8922a 100%)"
          : "linear-gradient(90deg, #fcdda6 0%, #dfeef3 100%)",
        // Track is visual only — dragging lives on the handle button
        touchAction: "pan-y",
      }}
    >
      {!showSuccess && (
        <p
          ref={labelRef}
          className="pointer-events-none absolute top-0 bottom-0 flex items-center whitespace-nowrap text-[14px] font-semibold uppercase tracking-[1.96px] text-[rgba(28,22,16,0.55)]"
          style={{
            left: labelLeft ?? "50%",
            transform: labelLeft == null ? "translateX(-50%)" : undefined,
            opacity: labelOpacity,
            transition: dragging ? "none" : "opacity 0.5s ease",
          }}
        >
          {labelText}
        </p>
      )}

      {showSuccess ? (
        <div
          className="flex h-full items-center justify-center gap-2 text-[14px] font-semibold uppercase tracking-[1.96px] text-[#fffaf2]"
          style={{ animation: "swipe-fade-in 0.5s ease both" }}
        >
          <span aria-hidden>✓</span>
          {successLabel}
        </div>
      ) : (
        <button
          type="button"
          aria-label={label}
          disabled={disabled || loading}
          className="absolute top-[4.77px] flex h-11 w-20 touch-none cursor-grab items-center justify-center rounded-full active:cursor-grabbing disabled:cursor-not-allowed"
          style={{
            left: padding + offset,
            opacity: handleOpacity,
            backgroundImage:
              "linear-gradient(151deg, rgb(252, 221, 166) 0%, rgb(200, 146, 42) 100%)",
            boxShadow:
              "0px 2px 8px 0px rgba(200,146,42,0.35), 0px 1px 2px 0px rgba(0,0,0,0.1)",
            transition: dragging
              ? "none"
              : "left 0.25s ease-out, opacity 0.5s ease",
            // Keep the track itself non-interactive for drag — only this handle moves
            pointerEvents: disabled || loading ? "none" : "auto",
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            begin(e.clientX);
          }}
          onPointerMove={(e) => {
            e.preventDefault();
            e.stopPropagation();
            move(e.clientX);
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void end();
          }}
          onPointerCancel={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void end();
          }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M7 4l6 6-6 6"
              stroke="#fffaf2"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
