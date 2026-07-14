"use client";

import { MilestonePath } from "@/components/progress/MilestonePath";
import { TaskList } from "@/components/tasks/TaskList";
import { SessionTimer } from "@/components/timer/SessionTimer";
import { BoltIcon, GemIcon } from "@/components/ui/Icons";
import { totalEffectiveGems } from "@/lib/scoring";
import type {
  ActiveSessionState,
  Milestone,
  Profile,
  Task,
  UserTask,
} from "@/types";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  profile: Profile;
  tasks: Task[];
  userTasks: UserTask[];
  milestones: Milestone[];
  initialActive: ActiveSessionState | null;
  sessionExp: number;
  /** Soft error from user_tasks backfill — page still renders */
  tasksWarning?: string;
};

export function DashboardClient({
  profile,
  tasks,
  userTasks: initialUserTasks,
  milestones,
  initialActive,
  sessionExp,
  tasksWarning,
}: Props) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [userTasks, setUserTasks] = useState(initialUserTasks);

  useEffect(() => {
    setUserTasks(initialUserTasks);
  }, [initialUserTasks]);

  // Refresh / remount: re-fetch server start + serverNow, then local count-up.
  useEffect(() => {
    let cancelled = false;
    async function syncSession() {
      try {
        const res = await fetch("/api/session");
        if (!res.ok) return;
        const data = (await res.json()) as {
          active: ActiveSessionState | null;
        };
        if (!cancelled) setActive(data.active);
      } catch {
        // Keep SSR initialActive if sync fails.
      }
    }
    void syncSession();
    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshTasks() {
    const res = await fetch("/api/tasks");
    if (!res.ok) return;
    const data = (await res.json()) as { userTasks: UserTask[] };
    setUserTasks(data.userTasks ?? []);
    router.refresh();
  }

  const claimed = userTasks.filter((ut) => ut.status === "claimed");
  const taskExp = claimed.reduce((sum, ut) => {
    const task = tasks.find((t) => t.id === ut.task_id);
    return sum + (task?.exp ?? 0);
  }, 0);
  const taskGems = claimed.reduce((sum, ut) => {
    const task = tasks.find((t) => t.id === ut.task_id);
    return sum + (task?.gem ?? 0);
  }, 0);
  const totalExp = taskExp + sessionExp;
  const gems = totalEffectiveGems(totalExp, taskGems);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-[rgba(200,146,42,0.1)] bg-[rgba(253,246,236,0.85)] backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-surface p-0.5">
              <div className="relative size-full overflow-hidden rounded-full bg-cream">
                <Image
                  src={profile.avatar_url || "/brand/icon_app_d.png"}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="36px"
                  unoptimized={Boolean(profile.avatar_url)}
                />
              </div>
            </div>
            <p className="truncate text-sm font-semibold text-ink">
              {profile.nickname}
            </p>
          </div>

          <Link
            href="/shop"
            className="flex shrink-0 items-center gap-3 rounded-full border border-[rgba(200,146,42,0.2)] bg-[rgba(252,221,166,0.4)] px-3.5 py-1.5"
            aria-label="Open shop to redeem"
          >
            <span className="flex items-center gap-1 text-xs font-semibold text-gold">
              <BoltIcon size={14} />
              {totalExp.toFixed(1)} EXP
            </span>
            <span className="h-3 w-px bg-[#fee685]" aria-hidden />
            <span className="flex items-center gap-1 text-xs font-semibold text-[#7b68ee]">
              <GemIcon size={14} />
              {gems.toFixed(1)} Gem
            </span>
          </Link>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-44 pt-4">
        <div className="mb-5">
          <MilestonePath milestones={milestones} currentGems={gems} compact />
        </div>

        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-[1.68px] text-[#8a7a68]">
            Your Tasks
          </h2>
          <Link
            href="/tasks"
            className="text-[10px] font-semibold uppercase tracking-wider text-gold"
          >
            See all
          </Link>
        </div>

        {tasksWarning ? (
          <p className="mb-3 rounded-2xl bg-[rgba(200,146,42,0.12)] px-4 py-3 text-center text-sm text-[#8a7a68]">
            Couldn&apos;t set up your tasks automatically. Try refreshing — if
            it keeps happening, ask a parent to check your account.
          </p>
        ) : null}

        <TaskList
          tasks={tasks}
          userTasks={userTasks}
          isChild={profile.is_child}
          limit={7}
          flat
          onChanged={() => void refreshTasks()}
        />
      </div>

      <SessionTimer
        isChild={profile.is_child}
        active={active}
        onActiveChange={setActive}
      />
    </div>
  );
}
