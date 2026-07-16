/**
 * Session timestamps are stored/written as UTC. Postgres TIMESTAMP without time
 * zone (and some Supabase serializations) omit the offset; browsers then treat
 * bare ISO strings as *local* time — in HKT that adds ~8 hours of false elapsed.
 */
export function toUtcIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();

  const trimmed = value.trim();
  if (!trimmed) return new Date(NaN).toISOString();

  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return new Date(trimmed).toISOString();
  }

  const normalized = trimmed.includes("T")
    ? trimmed
    : trimmed.replace(" ", "T");
  return new Date(`${normalized}Z`).toISOString();
}

export function parseUtcMs(value: string | Date): number {
  return new Date(toUtcIso(value)).getTime();
}

const HK_TIMEZONE = "Asia/Hong_Kong";
const CAMPAIGN_DAY1 = { year: 2026, month: 7, day: 18 };
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getHKDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HK_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
  };
}

/** Campaign day with 4:00 AM HKT rollover; July 18, 2026 is Day 1. */
export function getCampaignDay(now: Date = new Date()): number {
  const { year, month, day, hour } = getHKDateParts(now);
  const logical = new Date(Date.UTC(year, month - 1, day));
  if (hour < 4) {
    logical.setUTCDate(logical.getUTCDate() - 1);
  }

  const logicalMs = logical.getTime();
  const day1Ms = Date.UTC(
    CAMPAIGN_DAY1.year,
    CAMPAIGN_DAY1.month - 1,
    CAMPAIGN_DAY1.day,
  );

  return Math.floor((logicalMs - day1Ms) / MS_PER_DAY) + 1;
}
