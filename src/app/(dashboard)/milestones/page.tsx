"use client";

import { MilestonePath } from "@/components/progress/MilestonePath";
import { totalEffectiveGems } from "@/lib/scoring";
import type { Milestone, Task, UserTask } from "@/types";
import { useEffect, useState } from "react";

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [gems, setGems] = useState(0);

  useEffect(() => {
    async function load() {
      const [mRes, tRes] = await Promise.all([
        fetch("/api/milestones"),
        fetch("/api/tasks"),
      ]);
      const m = (await mRes.json()) as {
        milestones: Milestone[];
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
      setGems(totalEffectiveGems(taskExp + (m.sessionExp ?? 0), taskGems));
    }
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink">Milestones</h1>
      <MilestonePath milestones={milestones} currentGems={gems} />
    </div>
  );
}
