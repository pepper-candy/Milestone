"use client";

import type { Milestone } from "@/types";
import { getCampaignDay } from "@/lib/datetime";

type MilestonePathProps = {
  milestones: Milestone[];
  currentGems: number;
  compact?: boolean;
};

export function MilestonePath({
  milestones,
  currentGems,
  compact = false,
}: MilestonePathProps) {
  const sorted = [...milestones].sort(
    (a, b) => a.gem_threshold - b.gem_threshold,
  );
  const cap = sorted[sorted.length - 1]?.gem_threshold ?? 40;
  const next = sorted.find((m) => m.gem_threshold > currentGems);
  /** Progress toward the next prize (compact header). */
  const goalGems = next?.gem_threshold ?? cap;
  const nextProgress = Math.min(100, (currentGems / goalGems) * 100);
  const capProgress = Math.min(100, (currentGems / cap) * 100);

  const upcoming = sorted.filter((m) => m.gem_threshold > currentGems);
  const afterNext = upcoming[1];

  const compactLabel = next
    ? next.prize_name || next.title
    : sorted.length === 0
      ? "Milestone path unavailable"
      : "All milestones unlocked";

  const campaignDay = getCampaignDay();

  if (compact) {
    return (
      <div className="rounded-2xl border border-[rgba(200,146,42,0.15)] bg-[rgba(223,238,243,0.45)] px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] font-semibold tracking-[1.32px] text-[#8a7a68]">
            {compactLabel}
          </p>
          <p className="text-xs font-semibold tabular-nums text-ink">
            {currentGems.toFixed(1)} / {goalGems} gems
          </p>
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
        {afterNext ? (
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[11px] text-[#8a7a68]">
              Next: {afterNext.prize_name || afterNext.title}
            </p>
            <p className="shrink-0 text-xs font-semibold tabular-nums text-ink">
              Day {campaignDay}
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <section className="rounded-[28px] bg-sky/50 p-5">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 className="text-base font-semibold text-ink">Milestone Path</h2>
          <p className="text-sm text-text-muted">
            {currentGems.toFixed(1)} gems earned
          </p>
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-gold">
          Cap {cap}
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

      <div className="relative flex justify-between gap-2">
        <div className="absolute left-3 right-3 top-4 h-[2px] bg-[rgba(200,146,42,0.25)]" />
        {sorted.slice(0, 6).map((m, i) => {
          const unlocked = currentGems >= m.gem_threshold;
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
    </section>
  );
}
