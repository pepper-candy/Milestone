"use client";

import {
  generateRandomInviteCode,
  isInviteCodeFormatValid,
  normalizeInviteCodeInput,
} from "@/lib/invitation-code";
import { useCallback, useEffect, useState } from "react";

type InviteRole = "mentee" | "mentor";

type ValidationState = {
  valid: boolean;
  available: boolean;
  reason: string;
  checking: boolean;
};

type Props = {
  onInviteCreated?: () => void;
};

function SwitchIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="size-2.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1.5 3.5h7M4 1.5 1.5 3.5 4 5.5" />
      <path d="M10.5 8.5h-7M8 6.5 10.5 8.5 8 10.5" />
    </svg>
  );
}

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

const idleValidation: ValidationState = {
  valid: false,
  available: false,
  reason: "",
  checking: false,
};

export function LinkedInviteRow({ onInviteCreated }: Props) {
  const [role, setRole] = useState<InviteRole>("mentee");
  const [code, setCode] = useState("");
  const [loadingSuggest, setLoadingSuggest] = useState(true);
  const [validation, setValidation] = useState<ValidationState>(idleValidation);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadSuggestion = useCallback(async () => {
    setLoadingSuggest(true);
    setActionError(null);
    try {
      const res = await fetch("/api/invite?suggest=1");
      const json = (await res.json()) as { code?: string; error?: string };
      if (!res.ok || !json.code) {
        throw new Error(json.error || "Could not suggest a code");
      }
      setCode(json.code);
    } catch (err) {
      // Keep UX smooth even if suggest endpoint is unavailable.
      setCode(generateRandomInviteCode());
      setActionError(
        err instanceof Error ? err.message : "Could not suggest a code",
      );
    } finally {
      setLoadingSuggest(false);
    }
  }, []);

  useEffect(() => {
    void loadSuggestion();
  }, [loadSuggestion]);

  useEffect(() => {
    const normalized = normalizeInviteCodeInput(code);
    if (!normalized) {
      setValidation(idleValidation);
      return;
    }

    setValidation((prev) => ({ ...prev, checking: true }));
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/invite?code=${encodeURIComponent(normalized)}`,
          );
          const json = (await res.json()) as {
            valid?: boolean;
            available?: boolean;
            reason?: string;
            error?: string;
          };
          if (!res.ok) {
            // Allow submit when server check is down; block only known-used codes.
            const used = json.reason === "This code is already used";
            setValidation({
              valid: !used && isInviteCodeFormatValid(normalized),
              available: !used,
              reason: json.error || json.reason || "",
              checking: false,
            });
            return;
          }
          setValidation({
            valid: Boolean(json.valid && json.available),
            available: Boolean(json.available),
            reason: json.reason || "",
            checking: false,
          });
        } catch {
          setValidation({
            valid: isInviteCodeFormatValid(normalized),
            available: true,
            reason: "",
            checking: false,
          });
        }
      })();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [code]);

  const normalizedCode = normalizeInviteCodeInput(code);
  const canCreate =
    !loadingSuggest &&
    !creating &&
    !validation.checking &&
    isInviteCodeFormatValid(normalizedCode) &&
    validation.available;

  async function handleCopyInvitation() {
    const normalized = normalizeInviteCodeInput(code);
    if (!normalized) return;

    setCreating(true);
    setActionError(null);
    setCopied(false);

    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: normalized, role }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        reason?: string;
        error?: string;
      };

      if (!res.ok) {
        const message = json.reason || json.error || "Could not create invitation";
        if (res.status === 503) {
          const payload =
            role === "mentee"
              ? `Join me on Milestone as my mentee.\nInvitation code: ${normalized}\non Milestone: https://my-stone.vercel.app`
              : `Join me on Milestone as my linked mentor.\nInvitation code: ${normalized}\non Milestone: https://my-stone.vercel.app`;
          await navigator.clipboard.writeText(payload);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
          setActionError(
            "Code copied. Add SUPABASE_SERVICE_ROLE_KEY to create login accounts automatically.",
          );
          return;
        }
        setValidation({
          valid: false,
          available: false,
          reason: message,
          checking: false,
        });
        setActionError(message);
        return;
      }

      const payload =
        role === "mentee"
          ? `Join me on Milestone as my mentee.\nInvitation code: ${normalized}\non Milestone: https://my-stone.vercel.app`
          : `Join me on Milestone as my mentor.\nInvitation code: ${normalized}\non Milestone: https://my-stone.vercel.app`;

      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setValidation({
        valid: false,
        available: false,
        reason: "Code created — already used",
        checking: false,
      });
      window.setTimeout(() => setCopied(false), 2000);
      onInviteCreated?.();
      void loadSuggestion();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not create invitation",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-sm font-semibold uppercase tracking-[1.2px] text-[rgba(28,22,16,0.55)]">
        New linked invites to
      </h2>

      <div className="overflow-hidden rounded-2xl border border-[rgba(200,146,42,0.2)] bg-[rgba(255,250,242,0.9)] shadow-[inset_0px_1px_4px_0px_rgba(0,0,0,0.04)]">
        <div className="flex h-[54px] items-stretch">
          <div className="flex w-[102px] shrink-0 items-center justify-center gap-1.5 px-3">
            <button
              type="button"
              onClick={() =>
                setRole((current) =>
                  current === "mentee" ? "mentor" : "mentee",
                )
              }
              aria-label={`Invite as ${role}. Tap to switch.`}
              className={`flex h-[27px] w-[78px] min-w-[78px] max-w-[78px] shrink-0 basis-[78px] items-center justify-start gap-1 rounded-full border pl-2 pr-2.5 text-[11px] font-semibold uppercase tracking-[0.35px] transition ${
                role === "mentee"
                  ? "border-[rgba(200,146,42,0.35)] bg-gold text-[#fffaf2]"
                  : "border-[rgba(61,50,40,0.35)] bg-[#3d3228] text-[#f7f0e6]"
              }`}
            >
              <SwitchIcon />
              <span>{role === "mentee" ? "Mentee" : "Mentor"}</span>
            </button>
          </div>

          <div className="w-px shrink-0 self-stretch bg-[rgba(200,146,42,0.15)]" />

          <div className="flex min-w-0 flex-1 items-center px-3">
            <input
              value={code}
              onChange={(e) => {
                setActionError(null);
                setCopied(false);
                setCode(
                  e.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 5),
                );
              }}
              disabled={loadingSuggest || creating}
              maxLength={5}
              spellCheck={false}
              autoComplete="off"
              aria-label="Invitation code"
              className="w-full bg-transparent text-center text-2xl font-semibold tracking-[3px] text-ink outline-none placeholder:text-base placeholder:font-semibold placeholder:tracking-[2.4px] placeholder:text-[rgba(138,122,104,0.35)] disabled:opacity-60"
              placeholder="— — — — —"
            />
          </div>
        </div>

        <div className="border-t border-[rgba(200,146,42,0.15)]">
          <button
            type="button"
            disabled={!canCreate}
            onClick={() => void handleCopyInvitation()}
            className="flex w-full items-center justify-center gap-2 px-4 py-3.5 text-gold transition enabled:hover:bg-[rgba(200,146,42,0.06)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CopyIcon />
            <span className="text-xs font-semibold">
              {creating
                ? "Creating invitation…"
                : copied
                  ? "Copied!"
                  : "Copy Invitation Code"}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
