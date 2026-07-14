"use client";

import { EnvironmentalCheck } from "@/components/timer/EnvironmentalCheck";
import { ChevronDownIcon } from "@/components/ui/Icons";
import { SwipeToEnter } from "@/components/ui/SwipeToEnter";
import { useSessionClock } from "@/hooks/useGeolocation";
import { formatDuration } from "@/lib/scoring";
import type { ActiveSessionState, Session } from "@/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

type SessionTimerProps = {
  isChild: boolean;
  active: ActiveSessionState | null;
  onActiveChange: (next: ActiveSessionState | null) => void;
};

export function SessionTimer({
  isChild,
  active,
  onActiveChange,
}: SessionTimerProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "start-check" | "end-check">(
    "idle",
  );
  const [tutorial, setTutorial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kickKey, setKickKey] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  const elapsed = useSessionClock(
    active?.startedAt ?? null,
    active?.serverNow ?? null,
  );

  async function startSession(payload: {
    photo_url?: string;
    latitude?: number;
    longitude?: number;
  }) {
    setError(null);
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "start",
        is_tutorial: tutorial,
        ...payload,
      }),
    });
    const data = (await res.json()) as {
      active?: ActiveSessionState;
      error?: string;
    };
    if (!res.ok || !data.active) throw new Error(data.error || "Start failed");
    onActiveChange(data.active);
    setPhase("idle");
    setCollapsed(false);
  }

  async function endSession(payload: {
    photo_url?: string;
    latitude?: number;
    longitude?: number;
  }) {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "end", ...payload }),
    });
    const data = (await res.json()) as { session?: Session; error?: string };
    if (!res.ok || !data.session) throw new Error(data.error || "End failed");
    onActiveChange(null);
    setPhase("idle");
    router.push(`/dashboard/session/result?id=${data.session.id}`);
  }

  return (
    <>
      {!active ? (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[475px] rounded-t-[24px] bg-[rgba(255,250,242,0.97)] px-5 pb-4 pt-3 shadow-[0px_-4px_32px_0px_rgba(200,146,42,0.12)]">
          <div className="mb-2 flex justify-center">
            <div className="h-1 w-8 rounded-full bg-[rgba(200,146,42,0.25)]" />
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[1.68px] text-[#8a7a68]">
            Kickstart your session
          </p>
          {!isChild ? (
            <label className="mb-3 flex items-center gap-2 text-xs text-ink/70">
              <input
                type="checkbox"
                checked={tutorial}
                onChange={(e) => setTutorial(e.target.checked)}
                className="accent-gold"
              />
              Tutorial timer (3× EXP, no environment check)
            </label>
          ) : null}
          <SwipeToEnter
            key={kickKey}
            label="Swipe to Start"
            onComplete={async () => {
              setPhase("start-check");
            }}
          />
          {error ? (
            <p className="mt-2 text-center text-sm text-red-600">{error}</p>
          ) : null}
        </div>
      ) : null}

      {active && collapsed ? (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-[475px] items-center justify-between rounded-t-[24px] bg-[rgba(255,250,242,0.97)] px-5 pb-6 pt-3 shadow-[0px_-4px_32px_0px_rgba(200,146,42,0.12)]"
        >
          <div className="absolute left-1/2 top-3 h-1 w-8 -translate-x-1/2 rounded-full bg-[rgba(200,146,42,0.25)]" />
          <div className="mt-2 flex items-center gap-3">
            <span className="size-2 rounded-full bg-[#4caf50] shadow-[0_0_6px_#4caf50]" />
            <span className="text-sm font-semibold tracking-[0.35px] text-[rgba(28,22,16,0.7)]">
              Session running
            </span>
          </div>
          <span className="mt-2 font-serif text-lg tabular-nums tracking-wide text-gold">
            {formatDuration(elapsed)}
          </span>
        </button>
      ) : null}

      {active && !collapsed ? (
        <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[475px] rounded-t-[24px] bg-[rgba(255,250,242,0.97)] shadow-[0px_-4px_32px_0px_rgba(200,146,42,0.12)]">
          <div className="flex justify-center pb-1 pt-3">
            <div className="h-1 w-8 rounded-full bg-[rgba(200,146,42,0.25)]" />
          </div>
          <div className="flex flex-col gap-4 px-5 pb-6 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-[#4caf50] opacity-90 shadow-[0_0_6px_#4caf50]" />
                <h2 className="text-sm font-semibold uppercase tracking-[1.68px] text-[rgba(28,22,16,0.7)]">
                  Session running
                </h2>
                {active.isTutorial ? (
                  <span className="rounded-full bg-lavender/50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                    ×3
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="flex size-7 items-center justify-center rounded-full bg-[rgba(200,146,42,0.12)]"
                aria-label="Collapse session"
              >
                <ChevronDownIcon size={16} />
              </button>
            </div>

            <p
              className="flex items-center justify-center py-2 font-serif text-[48px] leading-none tracking-[2.88px] text-ink tabular-nums"
              aria-live="polite"
            >
              {formatDuration(elapsed)}
            </p>

            <SwipeToEnter
              label="Swipe to End"
              onComplete={async () => {
                setPhase("end-check");
              }}
            />
            {error ? (
              <p className="text-center text-sm text-red-600">{error}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {phase === "start-check" ? (
        <EnvironmentalCheck
          swipeLabel="Swipe to Start"
          requireEvidence={isChild || !tutorial}
          onCancel={() => {
            setPhase("idle");
            setKickKey((k) => k + 1);
          }}
          onConfirm={startSession}
        />
      ) : null}

      {phase === "end-check" ? (
        <EnvironmentalCheck
          swipeLabel="Swipe to End"
          requireEvidence={Boolean(active && !active.isTutorial)}
          onCancel={() => setPhase("idle")}
          onConfirm={endSession}
        />
      ) : null}
    </>
  );
}
