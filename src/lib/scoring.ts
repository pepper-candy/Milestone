/** Normal study sessions: 0.5 EXP per hour → 1 EXP per 2 hours. */
export const NORMAL_EXP_PER_HOUR = 0.5;

/** Tutorial sessions are 3× normal (= 1.5 EXP/hour). */
export const TUTORIAL_EXP_PER_HOUR = NORMAL_EXP_PER_HOUR * 3;

export function contributionFromTask(gem: number, exp: number) {
  return gem * 20 + exp;
}

export function totalEffectiveGems(totalExp: number, totalGems: number) {
  return totalExp / 20 + totalGems;
}

/** Round EXP to nearest 0.1, then return one-decimal number. */
export function calculateSessionExp(
  durationSeconds: number,
  isTutorial: boolean,
): number {
  const hours = durationSeconds / 3600;
  const rate = isTutorial ? TUTORIAL_EXP_PER_HOUR : NORMAL_EXP_PER_HOUR;
  const raw = hours * rate;
  return Math.round(raw * 10) / 10;
}

/** Haversine distance in meters. */
export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const LOCATION_CONSISTENCY_METERS = 150;

export function categoryFromTaskNo(taskNo: string): string {
  const upper = taskNo.toUpperCase();
  if (upper.startsWith("MATH_S4")) return "math_s4";
  if (upper.startsWith("MATH_")) return "math_s23";
  if (upper.startsWith("ENG_WRITING")) return "eng_writing";
  if (upper.startsWith("ENG_VOCAB")) return "eng_vocab";
  if (upper.startsWith("ENG_SPEAK")) return "eng_speaking";
  if (upper.startsWith("SOC_") || upper.startsWith("COMMUNITY"))
    return "community";
  return "math_s23";
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(" : ");
}
