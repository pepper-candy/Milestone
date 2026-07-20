"use client";

import { CameraIcon, MapPinIcon } from "@/components/ui/Icons";
import { LocationMapPreview } from "@/components/timer/LocationMapPreview";
import { useGeolocation } from "@/hooks/useGeolocation";
import { compressImage } from "@/lib/compress-image";
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type EnvironmentEvidencePayload = {
  photo_url?: string;
  latitude?: number;
  longitude?: number;
};

export type EnvironmentCheckHandle = {
  /** Validate + return payload for session start/end. Throws on missing evidence. */
  confirm: () => Promise<EnvironmentEvidencePayload>;
  reset: () => void;
};

type EnvironmentCheckPanelProps = {
  requireEvidence: boolean;
};

/**
 * Evidence fields only — parent sheet owns swipe / title / expand animation.
 */
export const EnvironmentCheckPanel = forwardRef<
  EnvironmentCheckHandle,
  EnvironmentCheckPanelProps
>(function EnvironmentCheckPanel({ requireEvidence }, ref) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const { coords, capture, loading: geoLoading, error: geoError } =
    useGeolocation();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useImperativeHandle(ref, () => ({
    async confirm() {
      setError(null);
      // Photo + GPS are optional; never auto-capture location.
      return {
        photo_url: photoUrl ?? undefined,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      };
    },
    reset() {
      setPhotoUrl(null);
      setPreview(null);
      setError(null);
      setBusy(false);
    },
  }));

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

  return (
    <div className="flex flex-col gap-3">
      {requireEvidence ? (
        <div className={`grid grid-cols-2 gap-3 ${busy ? "opacity-60" : ""}`}>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
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
                  Workspace
                </span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => void capture()}
            disabled={busy}
            className="relative flex aspect-square flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-[rgba(100,160,200,0.2)] bg-[rgba(223,238,243,0.3)]"
          >
            {coords ? (
              <LocationMapPreview
                latitude={coords.latitude}
                longitude={coords.longitude}
              />
            ) : (
              <>
                <MapPinIcon size={32} className="text-[#4a8bb8]" />
                <span className="px-2 text-center text-xs font-semibold tracking-[0.3px] text-[rgba(28,22,16,0.6)]">
                  {geoLoading ? "Locating…" : "Location (optional)"}
                </span>
              </>
            )}
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
        <p className="text-center text-sm text-red-600">{error || geoError}</p>
      )}
    </div>
  );
});
