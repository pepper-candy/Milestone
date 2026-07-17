/**
 * Canonical task catalog from ref/task_exp.csv.
 * Used to fill seq / prereqs / display fields when the DB row is stale.
 */
import type { Task } from "@/types";

export type CatalogEntry = {
  seq: number;
  task_no: string;
  category: string;
  description: string;
  exp: number;
  gem: number;
  prereq_1: string | null;
  prereq_2: string | null;
  requires_proof?: boolean;
};

export const TASK_CATALOG: CatalogEntry[] = [
  { seq: 1, task_no: "Math_S2_E2_P1", category: "Consolidation", description: "Reach the cut-off score.", exp: 5, gem: 1, prereq_1: null, prereq_2: null },
  { seq: 2, task_no: "Math_S2_E2_P2", category: "Consolidation", description: "Reach the cut-off score.", exp: 5, gem: 1, prereq_1: null, prereq_2: null },
  { seq: 3, task_no: "Math_S3_E1_P1", category: "Consolidation", description: "Reach the cut-off score.", exp: 10, gem: 1, prereq_1: "Math_S2_E2_P1", prereq_2: "Math_S2_E2_P2" },
  { seq: 4, task_no: "Math_S3_E1_P2", category: "Consolidation", description: "Reach the cut-off score.", exp: 10, gem: 1, prereq_1: "Math_S2_E2_P1", prereq_2: "Math_S2_E2_P2" },
  { seq: 5, task_no: "Math_S3_E2_P1", category: "Consolidation", description: "Reach the cut-off score.", exp: 25, gem: 1, prereq_1: "Math_S3_E1_P1", prereq_2: "Math_S3_E1_P2" },
  { seq: 6, task_no: "Math_S3_E2_P2", category: "Consolidation", description: "Reach the cut-off score.", exp: 20, gem: 1, prereq_1: "Math_S3_E1_P1", prereq_2: "Math_S3_E1_P2" },
  { seq: 7, task_no: "Math_S4_Q_Ch1", category: "Pre-Learning", description: "Reach the cut-off score.", exp: 5, gem: 1, prereq_1: "Math_S3_E2_P1", prereq_2: "Math_S3_E2_P2" },
  { seq: 8, task_no: "Math_S4_Q_Ch2", category: "Pre-Learning", description: "Reach the cut-off score.", exp: 15, gem: 1, prereq_1: "Math_S3_E2_P1", prereq_2: "Math_S3_E2_P2" },
  { seq: 9, task_no: "Math_S4_Q_Ch3", category: "Pre-Learning", description: "Reach the cut-off score.", exp: 10, gem: 1, prereq_1: "Math_S3_E2_P1", prereq_2: "Math_S3_E2_P2" },
  { seq: 10, task_no: "Math_S4_Q_Ch4", category: "Pre-Learning", description: "Reach the cut-off score.", exp: 25, gem: 1, prereq_1: "Math_S4_Q_Ch2", prereq_2: null },
  { seq: 11, task_no: "Math_S4_E1_P1", category: "Pre-Learning", description: "Reach the cut-off score.", exp: 35, gem: 1, prereq_1: "Math_S4_Q_Ch4", prereq_2: null },
  { seq: 12, task_no: "Math_S4_E1_P2", category: "Pre-Learning", description: "Reach the cut-off score.", exp: 35, gem: 1, prereq_1: "Math_S4_Q_Ch4", prereq_2: null },
  { seq: 13, task_no: "Eng_Writing_A1", category: "Writing and Grammar", description: "Finish Writing Task with 4 steps.", exp: 25, gem: 0, prereq_1: null, prereq_2: null },
  { seq: 14, task_no: "Eng_Writing_B2", category: "Writing and Grammar", description: "Finish Writing Task with 4 steps.", exp: 35, gem: 0, prereq_1: null, prereq_2: null },
  { seq: 15, task_no: "Eng_Writing_B3", category: "Writing and Grammar", description: "Finish Writing Task with 4 steps.", exp: 30, gem: 0, prereq_1: "Eng_Writing_B2", prereq_2: null },
  { seq: 16, task_no: "Eng_Vocab_1", category: "Vocabulary and Idioms", description: "Present newly learnt phrases.", exp: 15, gem: 0, prereq_1: null, prereq_2: null },
  { seq: 17, task_no: "Eng_Vocab_2", category: "Vocabulary and Idioms", description: "Present newly learnt phrases.", exp: 10, gem: 0, prereq_1: "Eng_Vocab_1", prereq_2: null },
  { seq: 18, task_no: "Eng_Vocab_3", category: "Vocabulary and Idioms", description: "Present newly learnt phrases.", exp: 5, gem: 0, prereq_1: "Eng_Vocab_2", prereq_2: null },
  { seq: 19, task_no: "Eng_Speak_1", category: "Speaking and Immersion", description: "GI followed by an IR.", exp: 10, gem: 0, prereq_1: null, prereq_2: null },
  { seq: 20, task_no: "Eng_Speak_2", category: "Speaking and Immersion", description: "GI followed by an IR.", exp: 5, gem: 0, prereq_1: "Eng_Speak_1", prereq_2: null },
  { seq: 21, task_no: "Eng_Speak_3", category: "Speaking and Immersion", description: "GI followed by an IR.", exp: 5, gem: 0, prereq_1: "Eng_Speak_2", prereq_2: null },
  { seq: 22, task_no: "Soc_Project_1", category: "社區專題", description: "完成 5分鐘 的簡短匯報。", exp: 35, gem: 0, prereq_1: null, prereq_2: null, requires_proof: true },
  { seq: 23, task_no: "Soc_Project_2", category: "社區專題", description: "完成 5分鐘 的簡短匯報。", exp: 30, gem: 0, prereq_1: "Soc_Project_1", prereq_2: null, requires_proof: true },
];

const byNo = new Map(
  TASK_CATALOG.map((e) => [e.task_no.toLowerCase(), e] as const),
);

export function catalogFor(taskNo: string): CatalogEntry | undefined {
  return byNo.get(taskNo.trim().toLowerCase());
}

function looksStaleCategory(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.toLowerCase();
  return (
    v === "math_s23" ||
    v === "math_s4" ||
    v === "eng_writing" ||
    v === "eng_vocab" ||
    v === "eng_speaking" ||
    v === "community" ||
    v.includes("?") ||
    v.startsWith("math s") ||
    v.startsWith("english ")
  );
}

function looksStaleDescription(value: string | null | undefined): boolean {
  if (!value) return true;
  const v = value.toLowerCase();
  return (
    v.includes("math exercise") ||
    v.includes("quiz chapter") ||
    v.includes("exam practice") ||
    v.includes("speaking practice") ||
    v.includes("vocabulary set") ||
    v.includes("writing assignment") ||
    v.includes("location + photo")
  );
}

/** Prefer DB values when set; catalog only fills nulls / stale gaps. */
export function enrichTask(task: Task): Task {
  const cat = catalogFor(task.task_no);
  if (!cat) return task;

  const emptyPrereq = (v: string | null | undefined) =>
    !v || !String(v).trim();

  return {
    ...task,
    seq: task.seq ?? cat.seq,
    category: looksStaleCategory(task.category) ? cat.category : task.category,
    title: looksStaleCategory(task.title) ? cat.category : task.title,
    description: looksStaleDescription(task.description)
      ? cat.description
      : task.description,
    // Never overwrite parent-edited rewards with CSV.
    exp: task.exp ?? cat.exp,
    gem: task.gem ?? cat.gem,
    prereq_1: emptyPrereq(task.prereq_1) ? cat.prereq_1 : task.prereq_1,
    prereq_2: emptyPrereq(task.prereq_2) ? cat.prereq_2 : task.prereq_2,
  };
}

export function enrichTasks(tasks: Task[]): Task[] {
  return tasks.map(enrichTask);
}
