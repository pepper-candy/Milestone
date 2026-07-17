import type { Task, UserTask } from "@/types";

export function normalizePrereqNo(no: string | null | undefined): string {
  return (no ?? "").trim();
}

/** All prerequisite task codes on a task (array preferred; legacy prereq_1/2 fallback). */
export function taskPrereqList(
  task: Pick<Task, "prereq_1" | "prereq_2" | "prereqs">,
): string[] {
  if (task.prereqs?.length) {
    return task.prereqs.map(normalizePrereqNo).filter(Boolean);
  }
  return [task.prereq_1, task.prereq_2]
    .map(normalizePrereqNo)
    .filter(Boolean);
}

/** Edit draft: at least two slots; preserve extras beyond two. */
export function draftPrerequisites(task: Task): string[] {
  const existing = taskPrereqList(task);
  if (existing.length === 0) return ["", ""];
  if (existing.length === 1) return [existing[0], ""];
  return [...existing];
}

export function filledPrereqCount(prereqs: string[]): number {
  return prereqs.filter((p) => normalizePrereqNo(p)).length;
}

export function prereqSidebarLabel(count: number): string {
  if (count === 0) return "NO PREREQUISITE";
  if (count === 1) return "1 PREREQUISITE";
  return `${count} PREREQUISITES`;
}

export function serializePrereqsForSave(prereqs: string[]): {
  prereq_1: string | null;
  prereq_2: string | null;
  prereqs: string[] | null;
} {
  const filled = prereqs.map(normalizePrereqNo).filter(Boolean);
  return {
    prereq_1: filled[0] ?? null,
    prereq_2: filled[1] ?? null,
    prereqs: filled.length > 0 ? filled : null,
  };
}

export function buildKnownTaskNos(tasks: Task[]): Set<string> {
  const known = new Set<string>();
  for (const task of tasks) {
    const no = normalizePrereqNo(task.task_no).toLowerCase();
    if (no) known.add(no);
  }
  return known;
}

/** Per task_no: how many assignments exist vs how many are finished (claimed). */
export type PrereqCompletionStats = Map<
  string,
  { total: number; claimed: number }
>;

export function buildPrereqCompletionStats(
  tasks: Task[],
  userTasks: UserTask[],
): PrereqCompletionStats {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const stats: PrereqCompletionStats = new Map();

  for (const ut of userTasks) {
    if (ut.status === "removed") continue;
    const task = byId.get(ut.task_id);
    if (!task) continue;
    const no = normalizePrereqNo(task.task_no).toLowerCase();
    if (!no) continue;
    const row = stats.get(no) ?? { total: 0, claimed: 0 };
    row.total += 1;
    if (ut.status === "claimed") row.claimed += 1;
    stats.set(no, row);
  }

  return stats;
}

/** Unknown / empty prereqs do not block unlock. */
export function isPrereqSatisfied(
  prereq: string,
  stats: PrereqCompletionStats,
  knownTaskNos: Set<string>,
): boolean {
  const n = normalizePrereqNo(prereq).toLowerCase();
  if (!n) return true;
  if (!knownTaskNos.has(n)) return true;
  const row = stats.get(n);
  if (!row || row.total === 0) return true;
  return row.claimed >= row.total;
}

export function isTaskUnlocked(
  task: Pick<Task, "prereq_1" | "prereq_2" | "prereqs">,
  stats: PrereqCompletionStats,
  knownTaskNos: Set<string>,
): boolean {
  for (const prereq of taskPrereqList(task)) {
    if (!isPrereqSatisfied(prereq, stats, knownTaskNos)) return false;
  }
  return true;
}

export function unmetPrereqHints(
  task: Pick<Task, "prereq_1" | "prereq_2" | "prereqs">,
  stats: PrereqCompletionStats,
  knownTaskNos: Set<string>,
): string[] {
  const hints: string[] = [];
  for (const prereq of taskPrereqList(task)) {
    const n = normalizePrereqNo(prereq);
    if (!n) continue;
    if (!knownTaskNos.has(n.toLowerCase())) continue;
    if (!isPrereqSatisfied(prereq, stats, knownTaskNos)) {
      hints.push(`Requires ${n}`);
    }
  }
  return hints;
}
