/**
 * Build task row fields from TASK_CATALOG + static task-details for Import Sample Template.
 */
import { TASK_CATALOG, type CatalogEntry } from "@/lib/task-catalog";
import { categoryKeyForTask, detailForTask } from "@/lib/task-details";
import type { Task } from "@/types";

function iconKeyForCatalog(entry: CatalogEntry): string {
  const stub = {
    task_no: entry.task_no,
    category: entry.category,
  } as Task;
  const kind = categoryKeyForTask(stub);
  switch (kind) {
    case "community":
      return "footprints";
    case "eng_speak":
      return "mic";
    case "eng_vocab":
      return "spark";
    case "eng_writing":
      return "book";
    case "math_consolidation":
    case "math_prelearning":
      return "target";
    default:
      return "target";
  }
}

export function sharedFieldsFromCatalogEntry(entry: CatalogEntry) {
  const stub = {
    id: "",
    task_no: entry.task_no,
    category: entry.category,
    exp: entry.exp,
    gem: entry.gem,
    title: null,
    description: entry.description,
    requires_proof: entry.requires_proof ?? false,
    seq: entry.seq,
    prereq_1: entry.prereq_1,
    prereq_2: entry.prereq_2,
  } as Task;

  const detail = detailForTask(stub);
  const prereqs = [entry.prereq_1, entry.prereq_2].filter(
    (p): p is string => Boolean(p),
  );

  return {
    task_no: entry.task_no,
    category: entry.category,
    title: detail?.fullTitle ?? entry.category,
    description: entry.description,
    exp: entry.exp,
    gem: entry.gem,
    requires_proof: entry.requires_proof ?? false,
    icon_key: iconKeyForCatalog(entry),
    detail_title: detail?.fullTitle ?? null,
    detail_lead: detail?.lead ?? null,
    detail_aim: detail?.paragraphs[1] ?? null,
    detail_body: detail?.paragraphs.slice(2).join("\n\n") || null,
    prereq_1: entry.prereq_1,
    prereq_2: entry.prereq_2,
    prereqs: prereqs.length > 0 ? prereqs : null,
    seq: entry.seq,
  };
}

export function sampleTemplateEntries(): CatalogEntry[] {
  return TASK_CATALOG;
}
