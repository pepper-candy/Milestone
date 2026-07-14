"use client";

import { CameraIcon, ChevronDownIcon, MapPinIcon } from "@/components/ui/Icons";
import { SwipeToEnter } from "@/components/ui/SwipeToEnter";
import { useGeolocation } from "@/hooks/useGeolocation";
import { compressImage } from "@/lib/compress-image";
import { useRef, useState } from "react";

type EnvironmentalCheckProps = {
  title?: string;
  swipeLabel: string;
  requireEvidence: boolean;
  onCancel: () => void;
  onConfirm: (payload: {
    photo_url?: string;
    latitude?: number;
    longitude?: number;
  }) => Promise<void>;
};

export function EnvironmentalCheck({
  title = "Environment Check",
  swipeLabel,
  requireEvidence,
  onCancel,
  onConfirm,
}: EnvironmentalCheckProps) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const { coords, capture, loading: geoLoading, error: geoError } =
    useGeolocation();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [swipeKey, setSwipeKey] = useState(0);

  async function onPhoto(file: File | null) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const compressed = await compressImage(file);
      const form = new FormData();
      form.append("file", compressed, "desk.jpg");
      form.append("folder", "sessions");
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed");
      setPhotoUrl(data.url);
      setPreview(URL.createObjectURL(compressed));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Photo failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSwipe() {
    setError(null);
    let latitude = coords?.latitude;
    let longitude = coords?.longitude;

    if (requireEvidence) {
      if (!photoUrl) {
        setError("Take a desk photo first.");
        setSwipeKey((k) => k + 1);
        throw new Error("photo");
      }
      if (latitude == null || longitude == null) {
        const c = await capture();
        latitude = c.latitude;
        longitude = c.longitude;
      }
    }

    await onConfirm({
      photo_url: photoUrl ?? undefined,
      latitude,
      longitude,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-[rgba(28,22,16,0.18)]"
        aria-label="Dismiss"
        onClick={onCancel}
      />
      <div className="animate-slide-in-up relative z-10 w-full max-w-[475px] rounded-t-[24px] bg-[rgba(255,250,242,0.97)] shadow-[0px_-4px_32px_0px_rgba(200,146,42,0.12)]">
        <div className="flex justify-center pb-1 pt-3">
          <div className="h-1 w-8 rounded-full bg-[rgba(200,146,42,0.25)]" />
        </div>

        <div className="flex flex-col gap-4 px-5 pb-5 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[1.68px] text-[rgba(28,22,16,0.7)]">
              {title}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              className="flex size-7 items-center justify-center rounded-full bg-[rgba(200,146,42,0.12)] text-ink"
              aria-label="Close"
            >
              <ChevronDownIcon size={16} />
            </button>
          </div>

          {requireEvidence ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-[rgba(200,146,42,0.18)] bg-[rgba(252,221,166,0.3)]"
              >
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={preview}
                    alt="Desk"
                    className="size-full object-cover"
                  />
                ) : (
                  <>
                    <CameraIcon size={32} className="text-gold" />
                    <span className="px-2 text-center text-xs font-semibold tracking-[0.3px] text-[rgba(28,22,16,0.6)]">
                      Take desk photo
                    </span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => void capture()}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-[rgba(100,160,200,0.2)] bg-[rgba(223,238,243,0.3)]"
              >
                <MapPinIcon size={32} className="text-[#4a8bb8]" />
                <span className="px-2 text-center text-xs font-semibold tracking-[0.3px] text-[rgba(28,22,16,0.6)]">
                  {coords
                    ? "Located"
                    : geoLoading
                      ? "Locating…"
                      : "Get location"}
                </span>
                {coords ? (
                  <span className="px-2 text-[10px] text-text-muted">
                    {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}
                  </span>
                ) : null}
              </button>
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)}
              />
            </div>
          ) : (
            <p className="rounded-2xl bg-sky/40 px-4 py-5 text-center text-sm text-text-muted">
              Parent tutorial sessions skip desk photo and GPS checks.
            </p>
          )}

          {(error || geoError) && (
            <p className="text-center text-sm text-red-600">
              {error || geoError}
            </p>
          )}

          <SwipeToEnter
            key={swipeKey}
            label={swipeLabel}
            disabled={busy}
            loading={busy}
            onComplete={handleSwipe}
          />
        </div>
      </div>
    </div>
  );
}
