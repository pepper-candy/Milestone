/**
 * Task requirement details from
 * ref/details_39b573964df58059a658d29ef3dc8539_updated.md
 *
 * paragraphs[0] = lead (PhaseLabel / rail-inset line).
 * paragraphs[1] = Aim (alone).
 * paragraphs[2+] = remaining body; consecutive lines use `\n` (no skipped lines).
 * Bold labels with **like this**.
 */
import type { Task } from "@/types";

export type TaskDetailBlock = {
  fullTitle: string;
  /** Compact one-liner for the collapsed card / PhaseLabel. */
  lead: string;
  /** [lead, aim, ...bodyBlocks] */
  paragraphs: string[];
};

function block(
  fullTitle: string,
  lead: string,
  aim: string,
  body: string[],
): TaskDetailBlock {
  return { fullTitle, lead, paragraphs: [lead, aim, ...body] };
}

const DETAILS: Record<string, TaskDetailBlock> = {
  eng_writing: block(
    "Writing and Grammar (Expressing)",
    "Finish Writing Task. (all 4 steps)",
    "**Aim:** To build writing confidence and explore different genres by practicing self-expression, doing online research, and learning from guided corrections.",
    [
      "**Files:** Eng DSE_2A_2024.jpg, Eng DSE_2B_2025.jpg\n**Requirement:** Finish Part A and Part B under the suggested learning cycle.\n1. Topic Research and Structure (Genre, Tone, Phrase/Vocab, Idioms, Examples)\n2. Express your Thoughts\n3. Recommended Amendments (Marking)\n4. Polished Version",
    ],
  ),
  eng_vocab: block(
    "Vocabulary and Idioms (Expanding)",
    "Presentation of newly learnt idioms and phrases.",
    "**Aim:** To enrich our active vocabulary bank by discovering real-world idioms from diverse media sources and mastering their usage.",
    [
      "**Related:** BBC Learning English, TED-Ed, Netflix, Disney+, any Internet Source, etc.\n**Requirement:** Should be newly learnt, with a demo on their usage.",
    ],
  ),
  eng_speak: block(
    "Speaking and Immersion (Engaging)",
    "Group Interaction followed by an Individual Response.",
    "**Aim:** To master DSE-style group interaction and individual response techniques through lively discussions of trending, real-world topics.",
    [
      "**Files:** Eng DSE_4_2023.pdf\n**Requirement:** Research on chosen topics and jot down notes beforehand.",
    ],
  ),
  math_consolidation: block(
    "S3 Math Consolidation",
    "Reach the cut-off score set on the paper.",
    "**Aim:** To reinforce junior math foundations.",
    [
      "**Files:** Math S2E2_1_2018.pdf, …, Math S3E2_2_2019.pdf\n**Requirement:** Revise before evaluation.",
    ],
  ),
  math_prelearning: block(
    "S4 Math Pre-Learning",
    "Reach the cut-off score set on the paper.",
    "**Aim:** To advance into next semester's chapters through structured preview and practice.",
    [
      "**Files:** Math S4E1_1_2018.pdf, …, Math S4E1_2_2021.pdf\n**Requirement:** Learn, Practice, and then Evaluate.\n\n**S4 Math Exam 1 PP Topics**\nCh1 Number System\nCh2 Quadratic Equations in One Unknown\nCh3 Introduction to Functions\nCh4 Graphs of Quadratic Functions and their Applications",
    ],
  ),
  community: block(
    "社區專題",
    "完成一個 5分鐘 的簡短匯報。",
    "**Aim:** Instead of staying at home and passively drifting through the virtual world, this assignment challenges us to engage with our physical surroundings and connect.",
    [
      "**關聯詞：** 習俗，工藝，變遷，痕跡，貼地，街訪，聲音，對比，評論，故事\n**要求：** 自行構思主題，編排專題內容，建議跨區探索\n**表達形式：** 報道、短片日記、攝影展、今昔對比、美食地圖……",
    ],
  ),
};

function keyForTask(task: Task): keyof typeof DETAILS | null {
  const no = task.task_no.toLowerCase();
  const cat = (task.category || "").toLowerCase();

  if (no.startsWith("eng_writing") || cat.includes("writing")) return "eng_writing";
  if (no.startsWith("eng_vocab") || cat.includes("vocab")) return "eng_vocab";
  if (no.startsWith("eng_speak") || cat.includes("speaking")) return "eng_speak";
  if (
    no.startsWith("soc_") ||
    cat.includes("社區") ||
    cat.includes("????") ||
    cat === "community"
  )
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

export function detailForTask(
  task: Task | undefined | null,
): TaskDetailBlock | null {
  if (!task) return null;
  const key = keyForTask(task);
  return key ? DETAILS[key] : null;
}
