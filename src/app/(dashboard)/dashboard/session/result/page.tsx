"use client";

import { BoltIcon, ChevronDownIcon } from "@/components/ui/Icons";
import { formatDuration } from "@/lib/scoring";
import type { Session } from "@/types";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function ResultInner() {
  const params = useSearchParams();
  const id = params.get("id");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const res = await fetch(`/api/session/${id}`);
      const data = (await res.json()) as { session?: Session; error?: string };
      if (!res.ok) {
        setError(data.error || "Could not load session");
        return;
      }
      setSession(data.session ?? null);
    }
    void load();
  }, [id]);

  if (error) {
    return <p className="px-4 text-center text-red-600">{error}</p>;
  }

  if (!session) {
    return <p className="px-4 text-center text-text-muted">Calculating…</p>;
  }

  const exp = Number(session.exp_earned).toFixed(1);

  return (
    <div className="relative flex min-h-[70vh] flex-col justify-end">
      <div className="absolute inset-0 bg-[rgba(28,22,16,0.12)]" aria-hidden />
      <div className="relative z-10 rounded-t-[24px] bg-[rgba(255,250,242,0.97)] px-5 pb-8 pt-3 shadow-[0px_-4px_32px_0px_rgba(200,146,42,0.12)]">
        <div className="mb-2 flex justify-center">
          <div className="h-1 w-8 rounded-full bg-[rgba(200,146,42,0.25)]" />
        </div>

        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-sm font-semibold uppercase tracking-[1.68px] text-[rgba(28,22,16,0.7)]">
            Session Complete
          </h1>
          <Link
            href="/dashboard"
            className="flex size-7 items-center justify-center rounded-full bg-[rgba(200,146,42,0.12)]"
            aria-label="Close"
          >
            <ChevronDownIcon size={16} />
          </Link>
        </div>

        <div
          className="mb-5 flex flex-col items-center gap-2 rounded-2xl border border-[rgba(200,146,42,0.2)] px-8 py-5"
          style={{
            backgroundImage:
              "linear-gradient(158deg, rgba(252, 221, 166, 0.5) 0%, rgba(223, 238, 243, 0.4) 100%)",
          }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[1.76px] text-[#8a7a68]">
            You earned
          </p>
          <div className="flex items-end gap-2">
            <span className="font-serif text-[48px] leading-none text-gold">
              {exp}
            </span>
            <span className="mb-2 flex items-center gap-1 text-lg font-semibold text-gold">
              <BoltIcon size={20} />
              EXP
            </span>
          </div>
          <div className="h-px w-8 bg-[rgba(200,146,42,0.25)]" />
          <p className="font-serif text-[36px] leading-none tracking-[2.16px] text-ink tabular-nums">
            {formatDuration(session.duration_seconds ?? 0)}
          </p>
          {session.is_tutorial ? (
            <p className="text-xs text-[#7b68ee]">Tutorial rate applied (×3)</p>
          ) : null}
          {session.location_consistent != null ? (
            <p className="text-[11px] text-[#8a7a68]">
              Location{" "}
              {session.location_consistent ? "consistent" : "drifted"}
            </p>
          ) : null}
        </div>

        <Link
          href="/dashboard"
          className="flex w-full items-center justify-center rounded-full py-4 text-sm font-semibold uppercase tracking-[1.96px] text-[#fffaf2] shadow-[0px_4px_8px_rgba(200,146,42,0.3)]"
          style={{
            backgroundImage:
              "linear-gradient(173deg, rgb(252, 221, 166) 0%, rgb(200, 146, 42) 100%)",
          }}
        >
          Claim & Continue
        </Link>
      </div>
    </div>
  );
}

export default function SessionResultPage() {
  return (
    <Suspense
      fallback={<p className="px-4 text-center text-text-muted">Loading…</p>}
    >
      <ResultInner />
    </Suspense>
  );
}
