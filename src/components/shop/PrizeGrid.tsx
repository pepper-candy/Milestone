"use client";

import type { Milestone, UserMilestone } from "@/types";

type PrizeGridProps = {
  milestones: Milestone[];
  userMilestones: UserMilestone[];
  currentGems: number;
};

export function PrizeGrid({
  milestones,
  userMilestones,
  currentGems,
}: PrizeGridProps) {
  const claimed = new Set(
    userMilestones.filter((u) => u.claimed).map((u) => u.milestone_id),
  );
  const sorted = [...milestones].sort(
    (a, b) => a.gem_threshold - b.gem_threshold,
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {sorted.map((m) => {
        const unlocked = currentGems >= m.gem_threshold;
        const isClaimed = claimed.has(m.id);
        return (
          <article
            key={m.id}
            className={`rounded-3xl p-5 ${
              unlocked
                ? "bg-cream/80 shadow-[0_4px_20px_rgba(200,146,42,0.15)]"
                : "bg-warm-bg/80 opacity-70"
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-gold">
                {m.gem_threshold} gems
              </span>
              <span className="text-xs text-text-muted">
                {isClaimed ? "Claimed" : unlocked ? "Unlocked" : "Locked"}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-ink">
              {m.prize_name || m.title}
            </h3>
            {m.title ? (
              <p className="mt-1 text-sm text-text-muted">{m.title}</p>
            ) : null}
            {m.prize_description ? (
              <p className="mt-2 text-sm text-ink/70">{m.prize_description}</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
