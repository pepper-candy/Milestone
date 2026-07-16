"use client";

import { compressImage } from "@/lib/compress-image";
import Image from "next/image";
import { useRef, useState } from "react";

type Props = {
  nickname: string;
  avatarUrl: string | null;
  saving: boolean;
  onNicknameChange: (value: string) => void;
  onSave: (avatarUrl: string | null) => void;
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

  function onPickFile(file: File | null) {
    if (!file) return;
    setAvatarFile(file);
    setPreview(URL.createObjectURL(file));
    setError(null);
  }

  async function handleSave() {
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

    onSave(nextAvatarUrl);
  }

  const displayAvatar = preview || avatarUrl;

  return (
    <div className="rounded-3xl border border-[rgba(200,146,42,0.2)] bg-[rgba(253,246,236,0.55)] px-5 py-6 shadow-[0px_8px_48px_0px_rgba(200,146,42,0.08)]">
      <p className="text-center text-sm font-semibold uppercase tracking-[1.4px] text-[rgba(28,22,16,0.55)]">
        Edit profile
      </p>

      <div className="mx-auto mt-5 flex justify-center">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="group relative size-28"
          aria-label="Upload avatar"
        >
          <div className="absolute -inset-3 rounded-full bg-[rgba(252,221,166,0.35)] blur-md" />
          <div className="relative size-full overflow-hidden rounded-full bg-surface shadow-[0px_4px_24px_0px_rgba(200,146,42,0.18)]">
            {displayAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayAvatar}
                alt="Avatar"
                className="size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center">
                <Image
                  src="/brand/icon_app_d.png"
                  alt=""
                  width={56}
                  height={56}
                  className="opacity-70"
                />
              </div>
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-[rgba(253,246,236,0.6)] text-[10px] font-semibold uppercase tracking-wide text-gold opacity-0 transition group-hover:opacity-100">
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
      </div>

      <label
        htmlFor="profile-nickname"
        className="mt-5 block text-center text-sm font-medium text-[rgba(28,22,16,0.7)]"
      >
        Your nickname
      </label>
      <input
        id="profile-nickname"
        value={nickname}
        onChange={(e) => {
          onNicknameChange(e.target.value);
          setError(null);
        }}
        className="mt-2 h-14 w-full rounded-2xl border border-[rgba(200,146,42,0.2)] bg-surface px-4 text-center text-lg font-semibold tracking-[1.6px] text-ink shadow-[inset_0px_1px_4px_0px_rgba(0,0,0,0.06)] outline-none focus:border-gold/50"
      />

      {error ? (
        <p className="mt-2 text-center text-sm text-red-600">{error}</p>
      ) : null}

      <button
        type="button"
        disabled={saving}
        onClick={() => void handleSave()}
        className="mt-5 w-full rounded-full px-6 py-3.5 text-sm font-semibold uppercase tracking-[1.6px] text-[#fffaf2] shadow-[0px_4px_8px_rgba(200,146,42,0.3)] disabled:opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(173deg, rgb(252, 221, 166) 0%, rgb(200, 146, 42) 100%)",
        }}
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
