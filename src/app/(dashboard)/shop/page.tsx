"use client";

import { PrizeGrid } from "@/components/shop/PrizeGrid";
import { totalEffectiveGems } from "@/lib/scoring";
import type { Milestone, Task, UserMilestone, UserTask } from "@/types";
import { useEffect, useState } from "react";

export default function ShopPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [userMilestones, setUserMilestones] = useState<UserMilestone[]>([]);
  const [gems, setGems] = useState(0);

  useEffect(() => {
    async function load() {
      const [mRes, tRes] = await Promise.all([
        fetch("/api/milestones"),
        fetch("/api/tasks"),
      ]);
      const m = (await mRes.json()) as {
        milestones: Milestone[];
        userMilestones: UserMilestone[];
        sessionExp: number;
      };
      const t = (await tRes.json()) as { tasks: Task[]; userTasks: UserTask[] };
      const claimed = (t.userTasks ?? []).filter((u) => u.status === "claimed");
      const taskExp = claimed.reduce((s, ut) => {
        const task = t.tasks.find((x) => x.id === ut.task_id);
        return s + (task?.exp ?? 0);
      }, 0);
      const taskGems = claimed.reduce((s, ut) => {
        const task = t.tasks.find((x) => x.id === ut.task_id);
        return s + (task?.gem ?? 0);
      }, 0);
      setMilestones(m.milestones ?? []);
      setUserMilestones(m.userMilestones ?? []);
      setGems(totalEffectiveGems(taskExp + (m.sessionExp ?? 0), taskGems));
    }
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Prize Shop</h1>
        <p className="text-sm text-text-muted">
          You have {gems.toFixed(1)} effective gems
        </p>
      </div>
      <PrizeGrid
        milestones={milestones}
        userMilestones={userMilestones}
        currentGems={gems}
      />
    </div>
  );
}
