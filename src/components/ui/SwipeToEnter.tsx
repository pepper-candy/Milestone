"use client";

import { useRef, useState } from "react";

type SwipeToEnterProps = {
  label?: string;
  disabled?: boolean;
  loading?: boolean;
  successLabel?: string;
  onComplete: () => void | Promise<void>;
};

export function SwipeToEnter({
  label = "Swipe to Enter",
  disabled = false,
  loading = false,
  successLabel,
  onComplete,
}: SwipeToEnterProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);
  const startX = useRef(0);
  const startOffset = useRef(0);

  const handleWidth = 80;
  const padding = 4;

  function maxOffset() {
    const width = trackRef.current?.clientWidth ?? 360;
    return Math.max(0, width - handleWidth - padding * 2);
  }

  function begin(clientX: number) {
    if (disabled || loading || done) return;
    setDragging(true);
    startX.current = clientX;
    startOffset.current = offset;
  }

  function move(clientX: number) {
    if (!dragging) return;
    const delta = clientX - startX.current;
    const next = Math.min(maxOffset(), Math.max(0, startOffset.current + delta));
    setOffset(next);
  }

  async function end() {
    if (!dragging) return;
    setDragging(false);
    const threshold = maxOffset() * 0.85;
    if (offset >= threshold) {
      setOffset(maxOffset());
      setDone(true);
      try {
        await onComplete();
      } catch {
        setDone(false);
        setOffset(0);
      }
    } else {
      setOffset(0);
    }
  }

  const showSuccess = done && successLabel;

  return (
    <div
      ref={trackRef}
      className="relative h-14 w-full overflow-hidden rounded-full border border-[rgba(200,146,42,0.2)] shadow-[0px_2px_12px_0px_rgba(200,146,42,0.15)]"
      style={{
        backgroundImage: showSuccess
          ? "linear-gradient(90deg, #fcdda6 0%, #c8922a 100%)"
          : "linear-gradient(90deg, #fcdda6 0%, #dfeef3 100%)",
      }}
      onPointerMove={(e) => move(e.clientX)}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={() => {
        if (dragging) void end();
      }}
    >
      {!showSuccess && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[14px] font-semibold uppercase tracking-[1.96px] text-[rgba(28,22,16,0.55)]">
          {loading ? "Please wait…" : label}
        </p>
      )}

      {showSuccess ? (
        <div className="flex h-full items-center justify-center gap-2 text-[14px] font-semibold uppercase tracking-[1.96px] text-[#fffaf2]">
          <span aria-hidden>✓</span>
          {successLabel}
        </div>
      ) : (
        <button
          type="button"
          aria-label={label}
          disabled={disabled || loading}
          className="absolute top-[4.77px] flex h-11 w-20 cursor-grab items-center justify-center rounded-full active:cursor-grabbing disabled:cursor-not-allowed"
          style={{
            left: padding + offset,
            backgroundImage:
              "linear-gradient(151deg, rgb(252, 221, 166) 0%, rgb(200, 146, 42) 100%)",
            boxShadow:
              "0px 2px 8px 0px rgba(200,146,42,0.35), 0px 1px 2px 0px rgba(0,0,0,0.1)",
            transition: dragging ? "none" : "left 0.2s ease-out",
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            begin(e.clientX);
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
