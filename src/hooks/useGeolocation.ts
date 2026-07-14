"use client";

import { useEffect, useRef, useState } from "react";

type GeoResult = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

export function useGeolocation() {
  const [coords, setCoords] = useState<GeoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function capture(): Promise<GeoResult> {
    setLoading(true);
    setError(null);
    try {
      const result = await new Promise<GeoResult>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation is not supported on this device."));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            }),
          (err) => reject(new Error(err.message || "Unable to get location")),
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
        );
      });
      setCoords(result);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Location failed";
      setError(message);
      throw e;
    } finally {
      setLoading(false);
    }
  }

  return { coords, error, loading, capture };
}

/**
 * Session timer: baseline = serverNow − startedAt (UTC), then count up with
 * performance.now() so device clock skew only matters at sync points.
 */
export function useSessionClock(
  startedAtIso: string | null,
  serverNowIso: string | null,
) {
  const [, setTick] = useState(0);
  const perfStart = useRef<number | null>(null);
  const baselineElapsed = useRef(0);
  const activeKey = `${startedAtIso}|${serverNowIso}`;
  const keyRef = useRef(activeKey);

  if (keyRef.current !== activeKey) {
    keyRef.current = activeKey;
    if (startedAtIso && serverNowIso) {
      const startedAt = new Date(startedAtIso).getTime();
      const serverNow = new Date(serverNowIso).getTime();
      baselineElapsed.current = Math.max(0, serverNow - startedAt);
      perfStart.current = performance.now();
    } else {
      baselineElapsed.current = 0;
      perfStart.current = null;
    }
  }

  useEffect(() => {
    if (!startedAtIso || !serverNowIso) return;

    const id = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 250);

    return () => window.clearInterval(id);
  }, [startedAtIso, serverNowIso]);

  if (!startedAtIso || !serverNowIso || perfStart.current == null) return 0;
  return Math.floor(
    (baselineElapsed.current + (performance.now() - perfStart.current)) / 1000,
  );
}
