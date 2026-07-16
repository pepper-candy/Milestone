import { getHKLogicalDayNumber } from "@/lib/datetime";
import quotes from "../../ref/quotes.json";

export type DailyQuote = {
  quote: string;
  author: string;
  theme?: string;
};

const QUOTES = quotes as DailyQuote[];

const FALLBACK: DailyQuote = {
  quote: "Keep going. Small steps still count.",
  author: "Milestone",
  theme: "Perseverance",
};

/** Base seed; each full cycle of n quotes mixes in the cycle number. */
const QUOTE_SHUFFLE_BASE = 0x4d31_510e; // "MILESTONE" flavored constant

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

/** Mulberry32 — small deterministic PRNG from a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle of 0..n-1, stable for a given seed. */
function shuffledIndices(n: number, seed: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  const rand = mulberry32(seed >>> 0);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return order;
}

/**
 * Quote of the day for all users:
 * - Day boundary: 4:00 AM HKT (same as campaign day)
 * - Order: seeded shuffle of all quotes (not JSON order)
 * - After every full pass (n days), a new seed → new shuffle for the next cycle
 */
export function getDailyQuote(date = new Date()): DailyQuote {
  const n = QUOTES.length;
  if (n === 0) return FALLBACK;

  const dayNumber = getHKLogicalDayNumber(date);
  const cycle = Math.floor(dayNumber / n);
  const offset = mod(dayNumber, n);
  const seed = (QUOTE_SHUFFLE_BASE ^ (cycle * 0x9e3779b9)) >>> 0;
  const order = shuffledIndices(n, seed);
  return QUOTES[order[offset]!] ?? FALLBACK;
}

/** Random quote, preferably different from the one currently shown. */
export function getRandomQuote(exclude?: DailyQuote | null): DailyQuote {
  if (QUOTES.length === 0) return FALLBACK;
  if (QUOTES.length === 1) return QUOTES[0]!;

  const current = exclude?.quote;
  let next = QUOTES[Math.floor(Math.random() * QUOTES.length)]!;
  let guard = 0;
  while (next.quote === current && guard < 8) {
    next = QUOTES[Math.floor(Math.random() * QUOTES.length)]!;
    guard += 1;
  }
  return next;
}
