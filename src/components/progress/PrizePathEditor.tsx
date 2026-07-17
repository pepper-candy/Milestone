"use client";

import { GemIcon, SparkIcon } from "@/components/ui/Icons";
import { notifyFamilySync } from "@/lib/family-sync";
import type { PrizePathStopInput } from "@/lib/prize-path";
import type { Milestone } from "@/types";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type DraftStop = {
  key: string;
  gem_threshold: string;
  prize_name: string;
};

type PrizePathEditorProps = {
  open: boolean;
  onClose: () => void;
  /** Parent can edit; child is read-only. */
  canEdit: boolean;
  menteeUserId: string | null;
  milestones: Milestone[];
  /** Current mentee gem balance — used for unlocked styling in read-only view. */
  currentGems?: number;
  onSaved: (milestones: Milestone[]) => void;
};

function blankDraft(): DraftStop {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    gem_threshold: "",
    prize_name: "",
  };
}

function toDraft(stops: Milestone[], canEdit: boolean): DraftStop[] {
  if (stops.length === 0) {
    return canEdit ? [blankDraft()] : [];
  }
  return [...stops]
    .sort((a, b) => a.gem_threshold - b.gem_threshold)
    .map((m, i) => ({
      key: m.id || `stop-${i}-${m.gem_threshold}`,
      gem_threshold: String(m.gem_threshold),
      prize_name: m.prize_name || m.title || "",
    }));
}

function sortDrafts(drafts: DraftStop[]): DraftStop[] {
  return [...drafts].sort((a, b) => {
    const ga = Math.floor(Number(a.gem_threshold));
    const gb = Math.floor(Number(b.gem_threshold));
    const na = Number.isFinite(ga) ? ga : Number.POSITIVE_INFINITY;
    const nb = Number.isFinite(gb) ? gb : Number.POSITIVE_INFINITY;
    if (na !== nb) return na - nb;
    return a.key.localeCompare(b.key);
  });
}

function draftsToStops(drafts: DraftStop[]): PrizePathStopInput[] {
  return sortDrafts(drafts)
    .filter((d) => {
      const gem = Math.floor(Number(d.gem_threshold));
      return Number.isFinite(gem) && gem >= 1 && d.prize_name.trim().length > 0;
    })
    .map((d) => ({
      gem_threshold: Math.floor(Number(d.gem_threshold)),
      prize_name: d.prize_name.trim(),
      title: d.prize_name.trim(),
    }));
}

const sheetShellClass =
  "fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[475px] flex-col rounded-t-[24px] bg-[rgba(255,250,242,0.98)] px-5 pb-6 pt-3 shadow-[0px_-4px_32px_0px_rgba(200,146,42,0.16)]";

const inputClass =
  "w-full rounded-lg border border-[rgba(200,146,42,0.3)] bg-[#fffaf2] px-2 py-1 text-sm text-ink outline-none placeholder:text-[rgba(138,122,104,0.55)]";

const gemInputClass = `${inputClass} text-left font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`;

/** Caps initial list viewport to 6 stop rows (row + gaps + list padding). */
const EDIT_LIST_MAX_H =
  "max-h-[calc(6*1.875rem+5*0.375rem+0.75rem)]";

/** Read-only prize cards (~57px) + space-y-2 gaps — 6 visible by default. */
const READ_LIST_MAX_H = "max-h-[calc(6*3.5625rem+5*0.5rem)]";

const SHEET_EXIT_MS = 320;
const SHEET_MAX_VH = 0.85;

function sheetMaxHeight(): number {
  if (typeof window === "undefined") return 640;
  return Math.round(window.innerHeight * SHEET_MAX_VH);
}

function remPx(): number {
  if (typeof window === "undefined") return 16;
  return (
    parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  );
}

type RowMetrics = { rowRem: number; gapRem: number; padRem: number };

const EDIT_ROW: RowMetrics = { rowRem: 1.875, gapRem: 0.375, padRem: 0.75 };
const READ_ROW: RowMetrics = { rowRem: 3.5625, gapRem: 0.5, padRem: 0 };

/** Sheet height that shows chrome + exactly one list row. */
function oneRowSheetHeight(
  measuredSheetH: number,
  visibleRows: number,
  metrics: RowMetrics = EDIT_ROW,
): number {
  const rem = remPx();
  const rowH = metrics.rowRem * rem;
  const gap = metrics.gapRem * rem;
  const listPad = metrics.padRem * rem;
  const rows = Math.max(1, visibleRows);
  const listBodyH = listPad + rows * rowH + Math.max(0, rows - 1) * gap;
  const oneRowListH = listPad + rowH;
  return Math.round(
    Math.max(oneRowListH + rem * 8, measuredSheetH - (listBodyH - oneRowListH)),
  );
}

function sixRowListHeight(metrics: RowMetrics): number {
  const rem = remPx();
  return Math.round(
    metrics.padRem * rem +
      6 * metrics.rowRem * rem +
      5 * metrics.gapRem * rem,
  );
}

export function PrizePathEditor({
  open,
  onClose,
  canEdit,
  menteeUserId,
  milestones,
  currentGems = 0,
  onSaved,
}: PrizePathEditorProps) {
  const [drafts, setDrafts] = useState<DraftStop[]>(() =>
    toDraft(milestones, canEdit),
  );
  const [busy, setBusy] = useState<"save" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const listBottomRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollAfterAddRef = useRef(false);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);
  const heightRef = useRef(0);
  const minHeightRef = useRef(280);

  useEffect(() => {
    if (!open) return;
    setMounted(true);
    setExiting(false);
    setSheetHeight(null);
    heightRef.current = 0;
    setDrafts(toDraft(milestones, canEdit));
    setError(null);
    setConfirmApply(false);
    setBusy(null);
    scrollAfterAddRef.current = false;
  }, [open, milestones, canEdit]);

  useEffect(() => {
    if (open || !mounted || exiting) return;
    setExiting(true);
  }, [open, mounted, exiting]);

  useEffect(() => {
    if (!exiting) return;
    const t = window.setTimeout(() => {
      setMounted(false);
      setExiting(false);
      setSheetHeight(null);
      heightRef.current = 0;
    }, SHEET_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [exiting]);

  useLayoutEffect(() => {
    if (!mounted || exiting || sheetHeight != null) return;
    const el = sheetRef.current;
    if (!el) return;
    const measured = Math.round(el.getBoundingClientRect().height);
    const metrics = canEdit ? EDIT_ROW : READ_ROW;
    const visibleRows =
      drafts.length === 0 ? 1 : Math.min(6, Math.max(1, drafts.length));
    const minH = oneRowSheetHeight(measured, visibleRows, metrics);
    minHeightRef.current = minH;
    // Cap default open height to chrome + at most 6 rows (list max-h already
    // applied; clamp protects if measure runs before layout settles).
    const sixList = sixRowListHeight(metrics);
    const chrome = Math.max(0, measured - sixList);
    const capped = Math.min(measured, chrome + sixList);
    const next = Math.min(sheetMaxHeight(), Math.max(minH, capped));
    heightRef.current = next;
    setSheetHeight(next);
  }, [mounted, exiting, sheetHeight, drafts.length, canEdit]);

  useLayoutEffect(() => {
    if (!scrollAfterAddRef.current) return;
    scrollAfterAddRef.current = false;
    listBottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [drafts.length]);

  function beginDrag(clientY: number) {
    if (exiting || sheetHeight == null) return;
    draggingRef.current = true;
    startYRef.current = clientY;
    startHeightRef.current = heightRef.current || sheetHeight;
    setIsDragging(true);
  }

  function moveDrag(clientY: number) {
    if (!draggingRef.current) return;
    const delta = clientY - startYRef.current;
    const minH = minHeightRef.current;
    const next = Math.min(
      sheetMaxHeight(),
      Math.max(minH, startHeightRef.current - delta),
    );
    heightRef.current = next;
    setSheetHeight(next);
  }

  function endDrag() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setIsDragging(false);
    const minH = minHeightRef.current;
    const clamped = Math.min(
      sheetMaxHeight(),
      Math.max(minH, heightRef.current),
    );
    heightRef.current = clamped;
    setSheetHeight(clamped);
  }

  if (!mounted) return null;

  function updateDraft(key: string, patch: Partial<DraftStop>) {
    setDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patch } : d)),
    );
  }

  function addStop() {
    scrollAfterAddRef.current = true;
    setDrafts((prev) => [...prev, blankDraft()]);
    setError(null);
  }

  function removeStop(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  async function handleSave() {
    if (!menteeUserId || !canEdit) return;
    setBusy("save");
    setError(null);
    try {
      const res = await fetch("/api/milestones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          user_id: menteeUserId,
          stops: draftsToStops(drafts),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        milestones?: Milestone[];
      };
      if (!res.ok) {
        setError(data.error || "Could not save prize path");
        return;
      }
      onSaved(data.milestones ?? []);
      void notifyFamilySync(menteeUserId, "dashboard");
      onClose();
    } catch {
      setError("Could not save. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  async function handleApplyAll() {
    if (!canEdit) return;
    setBusy("apply");
    setError(null);
    try {
      const res = await fetch("/api/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: "apply_all",
          stops: draftsToStops(drafts),
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        milestones?: PrizePathStopInput[];
      };
      if (!res.ok) {
        setError(data.error || "Could not apply to all mentees");
        return;
      }
      const next: Milestone[] = (data.milestones ?? draftsToStops(drafts)).map(
        (s, i) => ({
          id: `applied-${i}-${s.gem_threshold}`,
          gem_threshold: s.gem_threshold,
          title: s.title || s.prize_name || `${s.gem_threshold} gems`,
          prize_name: s.prize_name ?? null,
          prize_description: s.prize_description ?? null,
          icon: s.icon ?? null,
        }),
      );
      onSaved(next);
      if (menteeUserId) void notifyFamilySync(menteeUserId, "dashboard");
      setConfirmApply(false);
      onClose();
    } catch {
      setError("Could not apply. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  const heightLocked = sheetHeight != null;
  const sheetTransition =
    isDragging || exiting || !heightLocked
      ? undefined
      : "height 0.22s cubic-bezier(0.32, 0.72, 0, 1)";

  return (
    <>
      <button
        type="button"
        aria-label="Close prize path editor"
        className={`fixed inset-0 z-50 bg-transparent ${
          exiting ? "pointer-events-none" : ""
        }`}
        onClick={onClose}
      />
      <div className="pointer-events-none fixed inset-0 z-50 mx-auto max-w-[475px]">
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={canEdit ? "Prize Path Editor" : "Prize Path"}
          className={`${sheetShellClass} pointer-events-auto ${
            exiting ? "animate-sheet-slide-down" : "animate-sheet-slide-up"
          }`}
          style={{
            height: sheetHeight ?? undefined,
            maxHeight: `${SHEET_MAX_VH * 100}vh`,
            transition: sheetTransition,
          }}
        >
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to resize prize path editor"
          className="mb-0.5 flex cursor-grab touch-none justify-center active:cursor-grabbing"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            beginDrag(e.clientY);
          }}
          onPointerMove={(e) => moveDrag(e.clientY)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="h-1 w-8 rounded-full bg-[rgba(200,146,42,0.25)]" />
        </div>

        <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-1 text-base font-semibold text-ink">
            <SparkIcon size={18} className="shrink-0 text-gold" />
            <span className="truncate">
              {canEdit ? "Prize Path Editor" : "Prize Path"}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full px-2 py-1 text-sm font-semibold text-[#8a7a68] transition active:opacity-70"
          >
            Close
          </button>
        </div>

        <div
          className={
            heightLocked ? "flex min-h-0 flex-1 flex-col" : "min-h-0"
          }
        >
          {drafts.length === 0 ? (
            <div className="overflow-hidden rounded-2xl border border-dashed border-[rgba(200,146,42,0.25)] bg-[rgba(252,221,166,0.2)]">
              <div className="flex items-center gap-2 px-3 pt-1.5 pb-1">
                <span className="w-12 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-[#8a7a68]">
                  Gems
                </span>
                <span className="min-w-0 flex-1 text-[9px] font-semibold uppercase tracking-wider text-[#8a7a68]">
                  Prize
                </span>
                <span className="w-5 shrink-0" aria-hidden />
              </div>
              <p className="flex h-[1.875rem] items-center justify-center px-3 pb-1.5 text-center text-sm text-[#8a7a68]">
                {canEdit
                  ? 'Click the "Add stop" button to add a prize stop'
                  : "No prizes yet"}
              </p>
            </div>
          ) : canEdit ? (
            <div
              className={`overflow-hidden rounded-2xl border border-[rgba(200,146,42,0.15)] bg-[rgba(255,250,242,0.9)] ${
                heightLocked ? "flex min-h-0 flex-1 flex-col" : ""
              }`}
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-[rgba(200,146,42,0.1)] bg-[rgba(255,250,242,0.98)] px-3 pt-1.5 pb-1">
                <span className="w-12 shrink-0 text-[9px] font-semibold uppercase tracking-wider text-[#8a7a68]">
                  Gems
                </span>
                <span className="min-w-0 flex-1 text-[9px] font-semibold uppercase tracking-wider text-[#8a7a68]">
                  Prize
                </span>
                <span className="w-5 shrink-0" aria-hidden />
              </div>
              <div
                className={`space-y-1.5 overflow-y-auto px-3 py-1.5 ${
                  heightLocked
                    ? "min-h-0 flex-1"
                    : EDIT_LIST_MAX_H
                }`}
              >
                {drafts.map((d) => (
                  <div key={d.key} className="flex items-center gap-1.5">
                    <div className="w-12 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={9999}
                        inputMode="numeric"
                        value={d.gem_threshold}
                        onChange={(e) =>
                          updateDraft(d.key, { gem_threshold: e.target.value })
                        }
                        className={gemInputClass}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        value={d.prize_name}
                        placeholder="Prize name"
                        onChange={(e) =>
                          updateDraft(d.key, { prize_name: e.target.value })
                        }
                        className={inputClass}
                      />
                    </div>
                    <button
                      type="button"
                      aria-label="Remove prize stop"
                      onClick={() => removeStop(d.key)}
                      className="flex h-7 w-5 shrink-0 items-center justify-center text-xs font-semibold text-[#b71c1c]/80 transition active:opacity-70"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div ref={listBottomRef} aria-hidden className="h-px w-full" />
              </div>
            </div>
          ) : (
            <div
              className={`min-h-0 space-y-2 overflow-y-auto ${
                heightLocked ? "flex-1" : READ_LIST_MAX_H
              }`}
            >
              {drafts.map((d) => {
                const threshold = Math.floor(Number(d.gem_threshold)) || 0;
                const unlocked = currentGems >= threshold && threshold > 0;
                return (
                  <div
                    key={d.key}
                    className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 ${
                      unlocked
                        ? "border-[rgba(168,196,160,0.9)] bg-[rgba(168,196,160,0.12)]"
                        : "border-[rgba(200,146,42,0.15)] bg-[rgba(255,250,242,0.9)]"
                    }`}
                  >
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                      {d.prize_name || "Prize"}
                    </p>
                    <p
                      className={`flex shrink-0 items-center gap-1 text-xs tabular-nums ${
                        unlocked ? "text-[#5a7a52]" : "text-[#7b68ee]"
                      }`}
                    >
                      <GemIcon size={12} />
                      {d.gem_threshold}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error ? (
          <p className="mb-2 shrink-0 text-center text-sm text-red-600">
            {error}
          </p>
        ) : null}

        {canEdit ? (
          <div className="mt-2 shrink-0">
            <div className="relative flex gap-2">
              {confirmApply ? (
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => void handleApplyAll()}
                  className="absolute bottom-full right-0 mb-1.5 flex h-9 items-center justify-center rounded-2xl border border-[rgba(200,146,42,0.35)] bg-[rgba(255,250,242,0.98)] px-2 text-[11px] font-semibold uppercase tracking-[1.1px] text-gold shadow-[0px_-2px_16px_0px_rgba(200,146,42,0.12)] transition enabled:active:brightness-95 disabled:opacity-60 left-[calc((100%-3.25rem)/2+0.5rem)]"
                >
                  {busy === "apply" ? "Applying…" : "Apply to all mentees"}
                </button>
              ) : null}

              <button
                type="button"
                aria-label="Add prize stop"
                onClick={addStop}
                disabled={busy != null}
                className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1 rounded-2xl border border-dashed border-[rgba(200,146,42,0.35)] bg-[rgba(252,221,166,0.22)] pl-2 pr-4 text-[11px] font-semibold uppercase tracking-[1.2px] text-gold transition enabled:active:brightness-95 disabled:opacity-60"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden
                  className="shrink-0"
                >
                  <path
                    d="M10 4v12M4 10h12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                Add stop
              </button>

              <button
                type="button"
                disabled={busy != null || !menteeUserId}
                onClick={() => {
                  setConfirmApply(false);
                  void handleSave();
                }}
                className="flex h-9 min-w-0 flex-1 items-center justify-center rounded-2xl bg-gold text-[11px] font-semibold uppercase tracking-[1.4px] text-white transition enabled:active:brightness-95 disabled:opacity-60"
              >
                {busy === "save" ? "Saving…" : "Apply"}
              </button>

              <button
                type="button"
                aria-label={
                  confirmApply
                    ? "Hide apply to all mentees"
                    : "Show apply to all mentees"
                }
                aria-expanded={confirmApply}
                disabled={busy != null}
                onClick={() => setConfirmApply((v) => !v)}
                className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-gold text-white transition enabled:active:brightness-95 disabled:opacity-60"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden
                  className={`transition-transform ${confirmApply ? "rotate-180" : ""}`}
                >
                  <path
                    d="M5 12.5 10 7.5l5 5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        ) : null}
      </div>
      </div>
    </>
  );
}
