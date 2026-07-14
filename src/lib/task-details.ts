/**
 * Task requirement details from ref/details_39b573964df58059a658d29ef3dc8539.md
 */
import type { Task } from "@/types";

export type TaskDetailBlock = {
  fullTitle: string;
  /** Compact one-liner for the collapsed card. */
  lead: string;
  /** Expanded body as MD paragraphs (lead + following lines). */
  paragraphs: string[];
};

function block(
  fullTitle: string,
  lead: string,
  rest: string[],
): TaskDetailBlock {
  return { fullTitle, lead, paragraphs: [lead, ...rest] };
}

const DETAILS: Record<string, TaskDetailBlock> = {
  eng_writing: block(
    "English Writing and Grammar (Expressing)",
    "Finish Writing Task. (all 4 steps)",
    [
      "Aim: To build writing confidence and explore different genres by practicing self-expression, doing online research, and learning from guided corrections.",
      "Related files: Eng DSE_2A_2024.jpg, Eng DSE_2B_2025.jpg",
      "Requirement: Finish Part A and Part B under the suggested learning cycle.",
      "1. Topic Research and Structure (Genre, Tone, Phrase/Vocab, Idioms, Examples)",
      "2. Express your Thoughts",
      "3. Recommended Amendments (Marking)",
      "4. Polished Version",
    ],
  ),
  eng_vocab: block(
    "English Vocabulary and Idioms (Expanding)",
    "Presentation of newly learnt idioms and phrases.",
    [
      "Aim: To enrich our active vocabulary bank by discovering real-world idioms from diverse media sources and mastering their usage.",
      "Related: BBC Learning English, TED-Ed, Netflix, Disney+, any Internet Source, etc.",
      "Requirement: Should be newly learnt, with a demo on their usage.",
    ],
  ),
  eng_speak: block(
    "English Speaking and Immersion (Engaging)",
    "Group Interaction followed by an Individual Response.",
    [
      "Aim: To master DSE-style group interaction and individual response techniques through lively discussions of trending, real-world topics.",
      "Related files: Eng DSE_4_2023.pdf",
      "Requirement: Research the chosen topics and jot down notes beforehand.",
    ],
  ),
  math_consolidation: block(
    "Math Consolidation (Post-Learning)",
    "Reach the cut-off score set on the paper.",
    [
      "Aim: To reinforce junior math foundations.",
      "Related files: Math S2E2_1_2018.pdf, …, Math S3E2_2_2019.pdf",
      "Requirement: Revise before evaluation.",
    ],
  ),
  math_prelearning: block(
    "Math Pre-Learning (Pre-Learning)",
    "Reach the cut-off score set on the paper.",
    [
      "Aim: To advance into next semester's chapters through structured preview and practice.",
      "Related files: Math S4E1_1_2018.pdf, …, Math S4E1_2_2021.pdf",
      "Requirement: Learn, Practice, and then Evaluate.",
      "S4 Math Exam 1 PP Topics",
      "Ch1 Number System",
      "Ch2 Quadratic Equations in One Unknown",
      "Ch3 Introduction to Functions",
      "Ch4 Graphs of Quadratic Functions and their Applications",
    ],
  ),
  community: block(
    "社區專題",
    "完成一個 5分鐘 的簡短匯報。",
    [
      "Aim: Instead of staying at home and passively drifting through the virtual world, this assignment challenges us to engage with our physical surroundings and connect.",
      "關聯詞：習俗，工藝，今昔，變遷，痕跡，貼地，街坊，觀察，聲音，對比，評論，訪問，生活，故事",
      "要求：自行構思主題，編排專題內容，建議跨區探索",
      "表達形式：報道、短片日記、攝影展、今昔對比、美食地圖……",
    ],
  ),
};

function keyForTask(task: Task): keyof typeof DETAILS | null {
  const no = task.task_no.toLowerCase();
  const cat = (task.category || "").toLowerCase();

  if (no.startsWith("eng_writing") || cat.includes("writing")) return "eng_writing";
  if (no.startsWith("eng_vocab") || cat.includes("vocab")) return "eng_vocab";
  if (no.startsWith("eng_speak") || cat.includes("speaking")) return "eng_speak";
  if (no.startsWith("soc_") || cat.includes("社區") || cat.includes("????") || cat === "community")
    return "community";
  if (
    no.startsWith("math_s4") ||
    cat.includes("pre-learning") ||
    cat === "pre-learning"
  )
    return "math_prelearning";
  if (
    no.startsWith("math_") ||
    cat.includes("consolidation") ||
    cat === "consolidation"
  )
    return "math_consolidation";
  return null;
}

export function detailForTask(task: Task | undefined | null): TaskDetailBlock | null {
  if (!task) return null;
  const key = keyForTask(task);
  return key ? DETAILS[key] : null;
}
