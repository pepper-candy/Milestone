"use client";

import { CozyBackground } from "@/components/ui/CozyBackground";
import { SwipeToEnter } from "@/components/ui/SwipeToEnter";
import { compressImage } from "@/lib/compress-image";
import { createClient } from "@/lib/supabase/client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type LinkedChild = { invitation_code: string; nickname: string | null };

export default function SetupPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [nickname, setNickname] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [isChild, setIsChild] = useState(true);
  const [linkedChildren, setLinkedChildren] = useState<LinkedChild[]>([]);
  const [showParentContinue, setShowParentContinue] = useState(false);

  useEffect(() => {
    async function guard() {
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
        .select("nickname, is_child, linked_children")
        .eq("id", user.id)
        .maybeSingle();

      if (profile?.nickname && profile.nickname.trim()) {
        router.replace("/dashboard");
        return;
      }

      const childFlag =
        profile?.is_child ??
        (user.user_metadata?.is_child as boolean | undefined) ??
        true;
      setIsChild(childFlag);

      const linked =
        (profile?.linked_children as string[] | undefined) ??
        (user.user_metadata?.linked_children as string[] | undefined) ??
        [];

      if (!childFlag && linked.length) {
        const { data: kids } = await supabase
          .from("profiles")
          .select("invitation_code, nickname")
          .in("invitation_code", linked);
        setLinkedChildren(kids ?? []);
      }
    }
    void guard();
  }, [router]);

  function onPickFile(file: File | null) {
    if (!file) return;
    setAvatarFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  async function handleSubmit() {
    const name = nickname.trim();
    if (!name) {
      setError("Nickname is required.");
      throw new Error("nickname");
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("You must be signed in to save your profile.");
        router.replace("/login");
        throw new Error("unauthenticated");
      }

      let avatarUrl = "";

      if (avatarFile) {
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
          // Avatar is optional — continue with app icon default if Blob isn't configured
          console.warn(uploadData.error || "Avatar upload failed; using default icon");
        } else {
          avatarUrl = uploadData.url;
        }
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ nickname: name, avatar_url: avatarUrl })
        .eq("id", user.id);

      if (updateError) {
        setError(updateError.message || "Could not save profile");
        throw new Error(updateError.message);
      }

      setWelcome(true);
      await new Promise((r) => setTimeout(r, 800));

      if (!isChild) {
        setShowParentContinue(true);
      } else {
        router.replace("/dashboard");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (showParentContinue) {
    return (
      <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-warm-bg px-4 py-10">
        <CozyBackground />
        <div className="animate-slide-in-up relative z-10 w-full max-w-[440px] rounded-3xl bg-[rgba(253,246,236,0.7)] px-8 py-12 text-center shadow-[0px_8px_48px_0px_rgba(200,146,42,0.08)]">
          <h1 className="text-2xl font-semibold text-ink">Welcome, parent</h1>
          <p className="mt-2 text-sm text-[rgba(28,22,16,0.65)]">
            Your linked children
          </p>
          <ul className="mt-6 space-y-3 text-left">
            {linkedChildren.length === 0 ? (
              <li className="rounded-2xl bg-surface px-4 py-3 text-sm text-text-muted">
                No linked children found yet.
              </li>
            ) : (
              linkedChildren.map((c) => (
                <li
                  key={c.invitation_code}
                  className="rounded-2xl bg-surface px-4 py-3"
                >
                  <p className="font-semibold text-ink">
                    {c.nickname || "Not set up yet"}
                  </p>
                  <p className="text-xs uppercase tracking-wider text-gold">
                    {c.invitation_code}
                  </p>
                </li>
              ))
            )}
          </ul>
          <button
            type="button"
            onClick={() => {
              router.replace("/dashboard");
              router.refresh();
            }}
            className="mt-8 w-full rounded-full px-6 py-4 text-sm font-semibold uppercase tracking-[1.96px] text-[#fffaf2] shadow-[0px_4px_8px_rgba(200,146,42,0.3)]"
            style={{
              backgroundImage:
                "linear-gradient(173deg, rgb(252, 221, 166) 0%, rgb(200, 146, 42) 100%)",
            }}
          >
            Continue
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-warm-bg px-4 py-10">
      <CozyBackground />
      <div className="animate-slide-in-up relative z-10 w-full max-w-[440px] rounded-3xl bg-[rgba(253,246,236,0.55)] px-6 py-12 shadow-[0px_8px_48px_0px_rgba(200,146,42,0.08)] sm:px-10 sm:py-14">
        <div className="mx-auto mb-10 flex justify-center">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative size-[200px] sm:size-[260px]"
            aria-label="Upload avatar"
          >
            <div className="absolute -inset-4 rounded-full bg-[rgba(252,221,166,0.35)] blur-md" />
            <div className="relative flex size-full flex-col items-center justify-center overflow-hidden rounded-full bg-surface shadow-[0px_4px_40px_0px_rgba(200,146,42,0.18)] transition group-hover:bg-[rgba(253,246,236,0.9)]">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Avatar preview" className="size-full object-cover" />
              ) : (
                <>
                  <div className="relative mb-3 size-20 opacity-80 transition group-hover:opacity-40">
                    <Image
                      src="/brand/icon_app_d.png"
                      alt=""
                      fill
                      className="object-contain opacity-0"
                      aria-hidden
                    />
                    <svg
                      viewBox="0 0 80 80"
                      className="size-20 text-[rgba(28,22,16,0.35)]"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="40" cy="28" r="14" />
                      <path d="M16 66c4-14 16-22 24-22s20 8 24 22" />
                    </svg>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-[1.68px] text-[rgba(28,22,16,0.4)] group-hover:text-gold">
                    Add Avatar
                  </span>
                  <span className="pointer-events-none absolute inset-0 hidden items-center justify-center rounded-full bg-[rgba(253,246,236,0.75)] text-xs font-semibold uppercase tracking-[1.44px] text-gold group-hover:flex">
                    Upload
                  </span>
                </>
              )}
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

        <div className="flex flex-col gap-3">
          <label
            htmlFor="nickname"
            className="text-center text-base font-medium tracking-[0.4px] text-[rgba(28,22,16,0.7)]"
          >
            Your Nickname
          </label>
          <input
            id="nickname"
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              setError(null);
            }}
            placeholder="Your name here"
            className="h-[62px] w-full rounded-2xl border border-[rgba(200,146,42,0.2)] bg-surface px-6 text-center text-xl font-semibold tracking-[2.4px] text-ink shadow-[inset_0px_1px_4px_0px_rgba(0,0,0,0.06)] outline-none placeholder:tracking-[2.4px] placeholder:text-[rgba(138,122,104,0.4)] focus:border-gold/50"
          />
          <p className="text-center text-xs text-text-muted">
            Nickname can&apos;t be changed later
          </p>
          <div className="flex min-h-4 items-center justify-center">
            {error ? (
              <p className="text-center text-sm text-red-600">{error}</p>
            ) : null}
          </div>
          <SwipeToEnter
            label="Swipe to Continue"
            successLabel={welcome ? "Welcome!" : undefined}
            disabled={loading}
            loading={loading}
            onComplete={handleSubmit}
          />
        </div>
      </div>
    </main>
  );
}
