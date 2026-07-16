"use client";

import { ChevronDownIcon } from "@/components/ui/Icons";
import { compressImage } from "@/lib/compress-image";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type Props = {
  nickname: string;
  avatarUrl: string | null;
  saving: boolean;
  onNicknameChange: (value: string) => void;
  onSave: (avatarUrl: string | null) => Promise<boolean>;
};

export function ProfileEditCard({
  nickname,
  avatarUrl,
  saving,
  onNicknameChange,
  onSave,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [baselineNickname, setBaselineNickname] = useState(nickname.trim());
  const [baselineAvatarUrl, setBaselineAvatarUrl] = useState(avatarUrl);

  useEffect(() => {
    if (!avatarFile) {
      setBaselineAvatarUrl(avatarUrl);
    }
  }, [avatarUrl, avatarFile]);

  const dirty =
    nickname.trim() !== baselineNickname ||
    avatarFile != null ||
    (preview == null && avatarUrl !== baselineAvatarUrl);

  function markDirty() {
    setSaved(false);
    setError(null);
  }

  function onPickFile(file: File | null) {
    if (!file) return;
    setAvatarFile(file);
    setPreview(URL.createObjectURL(file));
    markDirty();
  }

  async function handleSave() {
    if (saving || saved || !dirty) return;

    const name = nickname.trim();
    if (!name) {
      setError("Nickname is required.");
      return;
    }

    setError(null);
    let nextAvatarUrl = avatarUrl;

    if (avatarFile) {
      try {
        const compressed = await compressImage(avatarFile);
        const form = new FormData();
        form.append("file", compressed, "avatar.jpg");
        form.append("folder", "avatars");
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: form,
        });
        const uploadData = (await uploadRes.json()) as {
          url?: string;
          error?: string;
        };
        if (!uploadRes.ok || !uploadData.url) {
          setError(uploadData.error || "Avatar upload failed");
          return;
        }
        nextAvatarUrl = uploadData.url;
      } catch {
        setError("Avatar upload failed");
        return;
      }
    }

    const ok = await onSave(nextAvatarUrl);
    if (!ok) return;

    setAvatarFile(null);
    setPreview(null);
    setBaselineNickname(name);
    setBaselineAvatarUrl(nextAvatarUrl);
    setSaved(true);
  }

  const displayAvatar = preview || avatarUrl;
  const canSave = !saving && !saved && dirty;
  const animMs = 380;
  const animEase = "cubic-bezier(0.22, 1, 0.36, 1)";

  return (
    <div className="rounded-3xl border border-[rgba(200,146,42,0.2)] bg-[rgba(253,246,236,0.55)] shadow-[0px_8px_48px_0px_rgba(200,146,42,0.08)]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <p className="text-sm font-semibold uppercase tracking-[1.4px] text-[rgba(28,22,16,0.55)]">
          Update profile
        </p>
        <ChevronDownIcon
          size={16}
          className={`shrink-0 text-gold transition-transform duration-[380ms] ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        className="grid"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
          transition: `grid-template-rows ${animMs}ms ${animEase}`,
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className="border-t border-[rgba(200,146,42,0.12)] px-5 pb-6 pt-4"
            style={{
              opacity: expanded ? 1 : 0,
              transition: `opacity ${animMs}ms ease`,
            }}
          >
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="group relative size-14 shrink-0"
                aria-label="Upload avatar"
              >
                <div className="absolute -inset-1.5 rounded-full bg-[rgba(252,221,166,0.35)] blur-md" />
                <div className="relative size-full overflow-hidden rounded-full bg-surface shadow-[0px_4px_16px_0px_rgba(200,146,42,0.18)]">
                  {displayAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={displayAvatar}
                      alt="Avatar"
                      className="size-full object-cover"
                    />
                  ) : (
                    <Image
                      src="/brand/icon_app_d.png"
                      alt=""
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center bg-[rgba(253,246,236,0.6)] text-[9px] font-semibold uppercase tracking-wide text-gold opacity-0 transition group-hover:opacity-100">
                    Upload
                  </span>
                </div>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />

              <div className="min-w-0 flex-1">
                <input
                  id="profile-nickname"
                  value={nickname}
                  onChange={(e) => {
                    onNicknameChange(e.target.value);
                    markDirty();
                  }}
                  aria-label="Nickname"
                  placeholder="Nickname"
                  className="h-11 w-full rounded-2xl border border-[rgba(200,146,42,0.2)] bg-surface px-4 text-base font-semibold tracking-[1.2px] text-ink shadow-[inset_0px_1px_4px_0px_rgba(0,0,0,0.06)] outline-none placeholder:font-medium placeholder:tracking-normal placeholder:text-[rgba(138,122,104,0.4)] focus:border-gold/50"
                />
              </div>
            </div>

            {error ? (
              <p className="mt-2 text-center text-sm text-red-600">{error}</p>
            ) : null}

            <button
              type="button"
              disabled={!canSave}
              onClick={() => void handleSave()}
              className="mt-4 w-full rounded-full px-6 py-2.5 text-sm font-semibold uppercase tracking-[1.6px] shadow-[0px_4px_8px_rgba(200,146,42,0.3)] disabled:cursor-not-allowed disabled:bg-[rgba(138,122,104,0.28)] disabled:text-[rgba(138,122,104,0.75)] disabled:shadow-none enabled:text-[#fffaf2]"
              style={
                canSave
                  ? {
                      backgroundImage:
                        "linear-gradient(173deg, rgb(252, 221, 166) 0%, rgb(200, 146, 42) 100%)",
                    }
                  : undefined
              }
            >
              {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
