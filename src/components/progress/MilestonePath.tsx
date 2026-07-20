"use client";

import { GemIcon } from "@/components/ui/Icons";
import {
  getJourneyDay,
  toHKLogicalDateString,
} from "@/lib/datetime";
import type { Milestone } from "@/types";
import { useRef, useState } from "react";

type MilestonePathProps = {
  milestones: Milestone[];
  currentGems: number;
  compact?: boolean;
  /** When set, compact card opens the prize path editor. */
  onOpenEditor?: () => void;
  /** Journey Day 1 date (YYYY-MM-DD) or null → use createdAt. */
  journeyStartDate?: string | null;
  /** Mentee profile created_at (join fallback for Day 1). */
  subjectCreatedAt?: string | null;
  /** Parent may pick a new Day 1 via calendar. */
  canEditJourneyStart?: boolean;
  onJourneyStartChange?: (ymd: string) => void | Promise<void>;
};

export function MilestonePath({
  milestones,
  currentGems,
  compact = false,
  onOpenEditor,
  journeyStartDate = null,
  subjectCreatedAt = null,
  canEditJourneyStart = false,
  onJourneyStartChange,
}: MilestonePathProps) {
  const sorted = [...milestones].sort(
    (a, b) => a.gem_threshold - b.gem_threshold,
  );
  const empty = sorted.length === 0;
  const cap = sorted[sorted.length - 1]?.gem_threshold ?? 40;
  const next = sorted.find((m) => m.gem_threshold > currentGems);
  /** Progress toward the next prize (compact header). */
  const goalGems = next?.gem_threshold ?? (empty ? null : cap);
  const gemsInt = Math.max(0, Math.floor(currentGems));
  const nextProgress =
    goalGems == null
      ? 0
      : Math.min(100, (gemsInt / Math.max(goalGems, 1)) * 100);
  const capProgress = empty
    ? 0
    : Math.min(100, (gemsInt / Math.max(cap, 1)) * 100);

  const upcoming = sorted.filter((m) => m.gem_threshold > gemsInt);
  const afterNext = upcoming[1];

  const compactLabel = next
    ? next.prize_name || next.title
    : empty
      ? "No prizes yet"
      : "All milestones unlocked";

  const journeyDay = getJourneyDay(journeyStartDate, subjectCreatedAt);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [savingDay, setSavingDay] = useState(false);
  const dateValue =
    journeyStartDate?.trim() ||
    (subjectCreatedAt ? toHKLogicalDateString(subjectCreatedAt) : toHKLogicalDateString());

  async function handleDatePicked(ymd: string) {
    if (!ymd || !onJourneyStartChange) return;
    setSavingDay(true);
    try {
      await onJourneyStartChange(ymd);
    } finally {
      setSavingDay(false);
    }
  }

  const dayControl =
    canEditJourneyStart && onJourneyStartChange ? (
      <>
        <button
          type="button"
          disabled={savingDay}
          onClick={(e) => {
            e.stopPropagation();
            dateInputRef.current?.showPicker?.();
            dateInputRef.current?.click();
          }}
          aria-label="Set journey start date"
          className="shrink-0 text-xs font-semibold tabular-nums text-ink underline decoration-[rgba(28,22,16,0.25)] underline-offset-2 transition active:opacity-70 disabled:opacity-50"
        >
          Day {journeyDay}
        </button>
        <input
          ref={dateInputRef}
          type="date"
          value={dateValue}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const v = e.target.value;
            if (v) void handleDatePicked(v);
          }}
        />
      </>
    ) : (
      <p className="shrink-0 text-xs font-semibold tabular-nums text-ink">
        Day {journeyDay}
      </p>
    );

  if (compact) {
    const shellClass =
      "rounded-2xl border border-[rgba(200,146,42,0.15)] bg-[rgba(223,238,243,0.45)] px-4 py-3 text-left";

    const progressBlock = (
      <>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] font-semibold tracking-[1.32px] text-[#8a7a68]">
            {compactLabel}
          </p>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold leading-none tabular-nums text-[#7b68ee]">
            <GemIcon size={14} className="translate-x-0.5" />
            {gemsInt} / {goalGems == null ? "—" : goalGems}
          </span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-white/70">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${nextProgress}%`,
              backgroundImage:
                "linear-gradient(90deg, #fcdda6 0%, #d4affb 55%, #f5c34b 100%)",
            }}
          />
        </div>
      </>
    );

    return (
      <div className={shellClass}>
        {onOpenEditor ? (
          <button
            type="button"
            onClick={onOpenEditor}
            aria-label="Open prize path"
            className="w-full text-left transition active:brightness-95"
          >
            {progressBlock}
          </button>
        ) : (
          progressBlock
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] text-[#8a7a68]">
            {afterNext
              ? `Next: ${afterNext.prize_name || afterNext.title}`
              : "\u00a0"}
          </p>
          {dayControl}
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-[28px] bg-sky/50 p-5">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Milestone Path</h2>
          <p className="text-sm text-text-muted">
            {empty ? "No prizes yet" : `${gemsInt} gems earned`}
          </p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-gold">
          {empty ? "—" : `Cap ${cap}`}
        </span>
      </div>

      <div className="relative mb-6 h-3 overflow-hidden rounded-full bg-white/70">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${capProgress}%`,
            backgroundImage:
              "linear-gradient(90deg, #fcdda6 0%, #d4affb 55%, #f5c34b 100%)",
          }}
        />
      </div>

      {empty ? (
        <p className="text-center text-sm text-[#8a7a68]">
          Prize stops will show here once added.
        </p>
      ) : (
        <div className="relative flex justify-between gap-2">
          <div className="absolute left-3 right-3 top-4 h-[2px] bg-[rgba(200,146,42,0.25)]" />
          {sorted.slice(0, 6).map((m, i) => {
            const unlocked = gemsInt >= m.gem_threshold;
            const isLast = i === Math.min(5, sorted.length - 1);
            return (
              <div
                key={m.id}
                className="relative z-10 flex flex-1 flex-col items-center text-center"
              >
                <div
                  className={`mb-2 flex size-8 items-center justify-center rounded-full text-xs font-bold ${
                    unlocked
                      ? isLast
                        ? "bg-glow text-ink shadow-[0_0_16px_rgba(245,195,75,0.8)]"
                        : "bg-cream text-ink"
                      : "bg-white text-[#8a7a68]"
                  }`}
                >
                  {m.icon || (unlocked ? "★" : i + 1)}
                </div>
                <p className="text-[10px] font-semibold text-ink">
                  {m.gem_threshold}g
                </p>
                <p className="mt-0.5 line-clamp-2 text-[10px] text-text-muted">
                  {m.prize_name || m.title}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
