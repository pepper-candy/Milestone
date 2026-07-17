"use client";

import { LinkedAccountCard } from "@/components/profile/LinkedAccountCard";
import { LinkedInviteRow } from "@/components/profile/LinkedInviteRow";
import { ProfileEditCard } from "@/components/profile/ProfileEditCard";
import { SpinnerIcon } from "@/components/ui/Icons";
import { hasNickname } from "@/lib/auth";
import {
  fetchProfile,
  getCachedProfile,
  setCachedProfile,
} from "@/lib/profile-client-cache";
import { invalidateSoftDashboard, markSoftDashboardStale } from "@/lib/soft-nav";
import type { ProfileApiResponse } from "@/types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function ProfilePageClient() {
  const router = useRouter();
  const cached = getCachedProfile();
  const [data, setData] = useState<ProfileApiResponse | null>(cached);
  const [nickname, setNickname] = useState(cached?.profile.nickname ?? "");
  const [loading, setLoading] = useState(!cached);
  const [saving, setSaving] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [removingCode, setRemovingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [goingBack, setGoingBack] = useState(false);

  const applyProfile = useCallback((json: ProfileApiResponse) => {
    setCachedProfile(json);
    setData(json);
    setNickname(json.profile.nickname ?? "");
  }, []);

  const loadProfile = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setLoading(!getCachedProfile());
      }
      setError(null);
      try {
        const json = await fetchProfile({ force: true });
        applyProfile(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load profile");
      } finally {
        setLoading(false);
      }
    },
    [applyProfile],
  );

  useEffect(() => {
    if (cached) {
      setLoading(false);
      void fetchProfile({ force: true })
        .then(applyProfile)
        .catch(() => {
          /* keep cached */
        });
      return;
    }
    void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  async function saveProfile(avatarUrl: string | null): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim(),
          avatar_url: avatarUrl,
        }),
      });
      const json = (await res.json()) as ProfileApiResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Could not save profile");
      }
      applyProfile(json);
      markSoftDashboardStale();
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function selectMentee(code: string) {
    if (!data || data.profile.is_child || data.selectedChildCode === code) {
      return;
    }

    setSelecting(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected_child_code: code }),
      });
      const json = (await res.json()) as ProfileApiResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Could not select mentee");
      }
      applyProfile(json);
      invalidateSoftDashboard();
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not select mentee");
    } finally {
      setSelecting(false);
    }
  }

  async function removeUnusedInvite(
    code: string,
    role: "mentee" | "mentor",
  ) {
    if (!data || data.profile.is_child || removingCode) return;

    const ok = window.confirm(
      role === "mentor"
        ? "Remove this unused co-mentor invite? The account will be deleted and the code can be used again."
        : "Remove this unused invite? The account will be deleted and the code can be used again.",
    );
    if (!ok) return;

    setRemovingCode(code);
    setError(null);
    try {
      const res = await fetch("/api/invite", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, role }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || "Could not remove invite");
      }
      await loadProfile();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove invite");
    } finally {
      setRemovingCode(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <SpinnerIcon size={22} className="text-gold" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-16">
        <p className="text-sm text-red-600">{error || "Profile unavailable"}</p>
        <button
          type="button"
          onClick={() => void loadProfile()}
          className="text-sm font-semibold text-gold"
        >
          Retry
        </button>
      </div>
    );
  }

  const isParent = !data.profile.is_child;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 bg-[#f7f0e6]/95 px-4 pb-3 pt-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={goingBack}
            onClick={() => {
              if (goingBack) return;
              setGoingBack(true);
              router.push("/dashboard");
            }}
            className="flex size-10 items-center justify-center rounded-full border border-[rgba(200,146,42,0.2)] bg-surface text-gold disabled:cursor-wait"
            aria-label="Back to dashboard"
          >
            {goingBack ? (
              <SpinnerIcon size={18} className="text-gold" />
            ) : (
              <svg
                viewBox="0 0 20 20"
                className="size-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M12.5 15 7.5 10l5-5" />
              </svg>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-ink">Profile</h1>
            <p className="text-xs text-[rgba(28,22,16,0.55)]">
              Manage your account and links
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[rgba(200,146,42,0.25)] bg-[rgba(252,221,166,0.35)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[1.2px] text-gold">
            {data.roleLabel}
          </span>
        </div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-6 pt-2">
        {error ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-center text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <ProfileEditCard
          nickname={nickname}
          avatarUrl={data.profile.avatar_url}
          saving={saving}
          onNicknameChange={setNickname}
          onSave={(avatarUrl) => saveProfile(avatarUrl)}
        />

        {isParent ? (
          <section className="flex flex-col gap-1.5">
            <h2 className="text-sm font-semibold uppercase tracking-[1.2px] text-[rgba(28,22,16,0.55)]">
              Your mentees ({data.linkedMentees.length})
            </h2>
            {data.linkedMentees.length === 0 ? (
              <p className="rounded-2xl bg-surface px-4 py-4 text-sm text-[rgba(28,22,16,0.55)]">
                Link up a mentee below.
              </p>
            ) : (
              <ul className="space-y-3">
                {data.linkedMentees.map((account) => {
                  const unused = !hasNickname(account.nickname);
                  return (
                    <li key={account.id}>
                      <LinkedAccountCard
                        account={account}
                        label="Mentee"
                        selectable
                        selected={
                          data.selectedChildCode === account.invitation_code
                        }
                        onSelect={() =>
                          void selectMentee(account.invitation_code)
                        }
                        removable={unused}
                        removing={removingCode === account.invitation_code}
                        onRemove={() =>
                          void removeUnusedInvite(
                            account.invitation_code,
                            "mentee",
                          )
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
            {selecting ? (
              <p className="mt-2 text-center text-xs text-gold">
                Switching mentee…
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="flex flex-col gap-1.5">
          <h2 className="text-sm font-semibold uppercase tracking-[1.2px] text-[rgba(28,22,16,0.55)]">
            Linked mentors ({data.linkedMentors.length})
          </h2>
          {data.linkedMentors.length === 0 ? (
            <p className="rounded-2xl bg-surface px-4 py-4 text-sm text-[rgba(28,22,16,0.55)]">
              {isParent
                ? "Invite a co-mentor below."
                : "No linked mentors yet."}
            </p>
          ) : (
            <ul className="space-y-3">
              {data.linkedMentors.map((account) => {
                const unused = isParent && !hasNickname(account.nickname);
                return (
                  <li key={account.id}>
                    <LinkedAccountCard
                      account={account}
                      label="Mentor"
                      removable={unused}
                      removing={removingCode === account.invitation_code}
                      onRemove={
                        unused
                          ? () =>
                              void removeUnusedInvite(
                                account.invitation_code,
                                "mentor",
                              )
                          : undefined
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {isParent ? (
          <LinkedInviteRow onInviteCreated={() => void loadProfile()} />
        ) : null}
      </div>
    </div>
  );
}
