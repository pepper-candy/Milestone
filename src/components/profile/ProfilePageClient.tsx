"use client";

import { LinkedAccountCard } from "@/components/profile/LinkedAccountCard";
import { LinkedInviteRow } from "@/components/profile/LinkedInviteRow";
import { ProfileEditCard } from "@/components/profile/ProfileEditCard";
import type { ProfileApiResponse } from "@/types";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export function ProfilePageClient() {
  const router = useRouter();
  const [data, setData] = useState<ProfileApiResponse | null>(null);
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || "Could not load profile");
      }
      const json = (await res.json()) as ProfileApiResponse;
      setData(json);
      setNickname(json.profile.nickname ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  async function saveProfile(avatarUrl: string | null) {
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
      setData(json);
      setNickname(json.profile.nickname ?? "");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
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
      setData(json);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not select mentee");
    } finally {
      setSelecting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <p className="text-sm text-[rgba(28,22,16,0.55)]">Loading profile…</p>
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
  const linkedList = isParent ? data.linkedMentees : data.linkedMentors;
  const linkedHeading = isParent ? "Your mentees" : "Your mentors";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 bg-[#f7f0e6]/95 px-4 pb-3 pt-4 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex size-9 items-center justify-center rounded-full border border-[rgba(200,146,42,0.2)] bg-surface text-gold"
            aria-label="Back to dashboard"
          >
            <svg
              viewBox="0 0 20 20"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M12.5 15 7.5 10l5-5" />
            </svg>
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

      <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-10 pt-2">
        {error ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-center text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[1.2px] text-[rgba(28,22,16,0.55)]">
            {linkedHeading}
          </h2>
          {linkedList.length === 0 ? (
            <p className="rounded-2xl bg-surface px-4 py-4 text-sm text-[rgba(28,22,16,0.55)]">
              {isParent
                ? "No linked mentees yet. Share your invitation code so they can join."
                : "No linked mentors yet."}
            </p>
          ) : (
            <ul className="space-y-3">
              {linkedList.map((account) => (
                <li key={account.id}>
                  <LinkedAccountCard
                    account={account}
                    label={isParent ? "Mentee" : "Mentor"}
                    selectable={isParent}
                    selected={
                      isParent && data.selectedChildCode === account.invitation_code
                    }
                    onSelect={
                      isParent
                        ? () => void selectMentee(account.invitation_code)
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          {isParent && selecting ? (
            <p className="mt-2 text-center text-xs text-gold">Switching mentee…</p>
          ) : null}
        </section>

        <ProfileEditCard
          nickname={nickname}
          avatarUrl={data.profile.avatar_url}
          saving={saving}
          onNicknameChange={setNickname}
          onSave={(avatarUrl) => void saveProfile(avatarUrl)}
        />

        {isParent ? (
          <LinkedInviteRow onInviteCreated={() => void loadProfile()} />
        ) : null}
      </div>
    </div>
  );
}
