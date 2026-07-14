"use client";

import { compressImage } from "@/lib/compress-image";
import { useGeolocation } from "@/hooks/useGeolocation";
import { SwipeToEnter } from "@/components/ui/SwipeToEnter";
import { useRef, useState } from "react";

export default function CommunityPage() {
  const cameraRef = useRef<HTMLInputElement>(null);
  const { coords, capture, loading: geoLoading } = useGeolocation();
  const [preview, setPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onPhoto(file: File | null) {
    if (!file) return;
    setError(null);
    const compressed = await compressImage(file);
    setPreview(URL.createObjectURL(compressed));
    const form = new FormData();
    form.append("file", compressed, "community.jpg");
    form.append("folder", "community");
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      setError(data.error || "Upload failed");
      return;
    }
    setPhotoUrl(data.url);
  }

  async function submit() {
    setError(null);
    let latitude = coords?.latitude;
    let longitude = coords?.longitude;
    if (latitude == null || longitude == null) {
      const c = await capture();
      latitude = c.latitude;
      longitude = c.longitude;
    }
    if (!photoUrl) {
      setError("Photo proof is required");
      throw new Error("photo");
    }

    const res = await fetch("/api/community", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photo_url: photoUrl,
        latitude,
        longitude,
        notes,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || "Submit failed");
      throw new Error(data.error);
    }
    setMessage("Proof submitted for community exploration.");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Community Explore</h1>
        <p className="text-sm text-text-muted">
          Capture GPS + photo proof for community projects.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="flex aspect-square flex-col items-center justify-center overflow-hidden rounded-3xl bg-cream/70"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Proof" className="size-full object-cover" />
          ) : (
            <>
              <span className="text-2xl">📷</span>
              <span className="mt-2 text-xs font-semibold uppercase tracking-wider">
                Photo
              </span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => void capture()}
          className="flex aspect-square flex-col items-center justify-center rounded-3xl bg-sky/70"
        >
          <span className="text-2xl">📍</span>
          <span className="mt-2 text-xs font-semibold uppercase tracking-wider">
            {geoLoading ? "Locating…" : coords ? "Located" : "GPS"}
          </span>
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)}
      />

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional notes"
        className="min-h-24 w-full rounded-2xl border border-[rgba(200,146,42,0.2)] bg-surface p-4 text-sm outline-none"
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-success">{message}</p> : null}

      <SwipeToEnter label="Swipe to Submit" onComplete={submit} />
    </div>
  );
}
