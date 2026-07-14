"use client";

import {
  BookIcon,
  BoltIcon,
  CheckIcon,
  GemIcon,
  LockIcon,
  TargetIcon,
} from "@/components/ui/Icons";
import type { Task, UserTask } from "@/types";

type TaskCardProps = {
  task: Task;
  userTask?: UserTask;
  isChild: boolean;
  locked?: boolean;
  lockHint?: string;
  onAction?: (action: "complete" | "approve" | "claim") => void;
};

function TaskGlyph({
  task,
  locked,
  claimed,
}: {
  task: Task;
  locked: boolean;
  claimed: boolean;
}) {
  if (locked) {
    return <LockIcon size={20} className="text-[rgba(138,122,104,0.7)]" />;
  }
  if (claimed) {
    return <CheckIcon size={22} className="text-gold" />;
  }
  if (task.category.startsWith("math") || task.task_no.toLowerCase().includes("goal")) {
    return <TargetIcon size={24} className="text-gold" />;
  }
  return <BookIcon size={24} className="text-gold" />;
}

export function TaskCard({
  task,
  userTask,
  isChild,
  locked = false,
  lockHint,
  onAction,
}: TaskCardProps) {
  const status = userTask?.status;
  const claimed = status === "claimed";
  const verified = status === "verified";
  const pending = status === "pending";

  let action: "complete" | "approve" | "claim" | null = null;
  let doneLook = claimed;

  if (!locked) {
    if (isChild) {
      if (!status) action = "complete";
      else if (verified) action = "claim";
      else if (claimed) doneLook = true;
    } else if (pending) {
      action = "approve";
    } else if (claimed || verified) {
      doneLook = true;
    }
  }

  const subtitle =
    lockHint ||
    (pending && isChild
      ? "Waiting for parent approval"
      : verified && isChild
        ? "Ready to claim"
        : task.description || null);

  return (
    <article
      className={`flex h-[82px] overflow-hidden rounded-2xl border shadow-[0px_2px_16px_0px_rgba(200,146,42,0.08)] ${
        locked
          ? "border-[rgba(200,146,42,0.08)] bg-[rgba(240,232,216,0.5)] opacity-70"
          : "border-[rgba(200,146,42,0.18)] bg-[rgba(255,250,242,0.9)]"
      }`}
    >
      <div
        className={`flex w-16 shrink-0 items-center justify-center ${
          locked ? "bg-[rgba(200,146,42,0.06)]" : "bg-[rgba(252,221,166,0.35)]"
        }`}
      >
        <TaskGlyph task={task} locked={locked} claimed={claimed} />
      </div>

      <div className="min-w-0 flex-1 p-3">
        <div className="mb-0.5 flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[1.32px] text-[#8a7a68]">
            {task.task_no}
          </p>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5 text-[11px] font-semibold text-gold">
              <BoltIcon size={12} />
              {task.exp}
            </span>
            <span className="flex items-center gap-0.5 text-[11px] font-semibold text-[#7b68ee]">
              <GemIcon size={12} />
              {task.gem}
            </span>
          </div>
        </div>
        <p className="truncate text-sm font-semibold leading-[19px] text-ink">
          {task.title || task.task_no}
        </p>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs leading-[16.5px] text-[#8a7a68]">
            {subtitle}
          </p>
        ) : null}
      </div>

      <div className="flex items-end p-3">
        <button
          type="button"
          disabled={!action || !onAction || locked}
          onClick={() => action && onAction?.(action)}
          aria-label={
            action === "claim"
              ? "Claim reward"
              : action === "approve"
                ? "Approve task"
                : action === "complete"
                  ? "Mark complete"
                  : "Task status"
          }
          className={`flex size-8 items-center justify-center rounded-full transition ${
            doneLook || action === "claim"
              ? "text-[#fffaf2] shadow-[0px_2px_6px_rgba(200,146,42,0.3)]"
              : "bg-[rgba(200,146,42,0.08)] text-[rgba(200,146,42,0.35)]"
          } disabled:cursor-default`}
          style={
            doneLook || action === "claim"
              ? {
                  backgroundImage:
                    "linear-gradient(135deg, rgb(252, 221, 166) 0%, rgb(200, 146, 42) 100%)",
                }
              : undefined
          }
        >
          <CheckIcon size={16} className={doneLook || action === "claim" ? "text-[#fffaf2]" : undefined} />
        </button>
      </div>
    </article>
  );
}
