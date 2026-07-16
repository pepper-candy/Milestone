import type { ProfileApiResponse } from "@/types";

let cached: ProfileApiResponse | null = null;
let inflight: Promise<ProfileApiResponse> | null = null;

export function getCachedProfile(): ProfileApiResponse | null {
  return cached;
}

export function setCachedProfile(data: ProfileApiResponse) {
  cached = data;
}

export function clearCachedProfile() {
  cached = null;
  inflight = null;
}

/** Prefetch or return cached profile. Pass force to bypass cache. */
export async function fetchProfile(options?: {
  force?: boolean;
}): Promise<ProfileApiResponse> {
  if (!options?.force && cached) return cached;
  if (!options?.force && inflight) return inflight;

  const request = (async () => {
    const res = await fetch("/api/profile");
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "Could not load profile");
    }
    const json = (await res.json()) as ProfileApiResponse;
    cached = json;
    return json;
  })();

  inflight = request;
  try {
    return await request;
  } finally {
    if (inflight === request) inflight = null;
  }
}

export function prefetchProfile() {
  void fetchProfile().catch(() => {
    /* warm cache; ignore errors until profile opens */
  });
}
