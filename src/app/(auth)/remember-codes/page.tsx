"use client";

import { CozyBackground } from "@/components/ui/CozyBackground";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5V4a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
    </svg>
  );
}

export default function RememberCodesPage() {
  const router = useRouter();
  const [parentCode, setParentCode] = useState("");
  const [childCode, setChildCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("nickname, is_child, invitation_code, linked_children")
        .eq("id", user.id)
        .maybeSingle();

      if (!profile || profile.is_child) {
        router.replace("/dashboard");
        return;
      }

      if (!profile.nickname?.trim()) {
        router.replace("/setup");
        return;
      }

      try {
        const res = await fetch("/api/auth/first-child", { method: "POST" });
        const data = (await res.json()) as {
          error?: string;
          parentCode?: string;
          childCode?: string;
        };
        if (!res.ok || !data.parentCode || !data.childCode) {
          setError(data.error || "Could not prepare mentee code");
          setLoading(false);
          return;
        }
        setParentCode(data.parentCode);
        setChildCode(data.childCode);
      } catch {
        setError("Could not prepare mentee code");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [router]);

  async function copyMenteeInvitation() {
    const normalized = childCode.trim().toUpperCase();
    const text = `Join me on Milestone (https://my-stone.vercel.app) as my mentee. Invitation code: ${normalized}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy. Please write the codes down.");
    }
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-warm-bg px-4 py-10">
      <CozyBackground />
      <div className="animate-slide-in-up relative z-10 w-full max-w-[440px] rounded-3xl bg-[rgba(253,246,236,0.7)] px-8 py-12 text-center shadow-[0px_8px_48px_0px_rgba(200,146,42,0.08)]">
        <h1 className="text-2xl font-semibold text-ink">Save your codes</h1>
        <p className="mt-2 text-sm text-[rgba(28,22,16,0.65)]">
          Screenshot or write these down.
          <br />
          You will need them to sign in.
        </p>

        {loading ? (
          <p className="mt-8 text-sm text-text-muted">Preparing your mentee…</p>
        ) : error ? (
          <p className="mt-8 text-sm text-red-600">{error}</p>
        ) : (
          <ul className="mt-8 space-y-3 text-left">
            <li className="rounded-2xl bg-surface px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[1.4px] text-gold">
                Your mentor code
              </p>
              <p className="mt-1 text-xl font-semibold tracking-[4px] text-ink">
                {parentCode}
              </p>
            </li>
            <li className="rounded-2xl bg-surface px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[1.4px] text-gold">
                First mentee code
              </p>
              <p className="mt-1 text-xl font-semibold tracking-[4px] text-ink">
                {childCode}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Account linked — send this to your mentee.
              </p>
            </li>
          </ul>
        )}

        <button
          type="button"
          disabled={loading || Boolean(error) || !childCode}
          onClick={() => void copyMenteeInvitation()}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-[rgba(200,146,42,0.35)] bg-surface px-6 py-3.5 text-gold transition hover:bg-[rgba(252,221,166,0.28)] disabled:opacity-50"
        >
          <CopyIcon />
          <span className="text-sm font-semibold">
            {copied ? "Copied!" : "Copy Mentee Invitation"}
          </span>
        </button>

        <button
          type="button"
          disabled={loading || Boolean(error) || !childCode}
          onClick={() => {
            router.replace("/dashboard");
            router.refresh();
          }}
          className="mt-3 w-full rounded-full px-6 py-4 text-sm font-semibold uppercase tracking-[1.96px] text-[#fffaf2] shadow-[0px_4px_8px_rgba(200,146,42,0.3)] disabled:opacity-50"
          style={{
            backgroundImage:
              "linear-gradient(173deg, rgb(252, 221, 166) 0%, rgb(200, 146, 42) 100%)",
          }}
        >
          Continue to dashboard
        </button>
      </div>
    </main>
  );
}
