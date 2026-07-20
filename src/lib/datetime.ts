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
/** @deprecated Global campaign fallback; prefer getJourneyDay with mentee start. */
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

/** Logical calendar day start (UTC midnight of Y-M-D) with 4:00 AM HKT rollover. */
export function getHKLogicalDayStartMs(now: Date = new Date()): number {
  const { year, month, day, hour } = getHKDateParts(now);
  const logical = new Date(Date.UTC(year, month - 1, day));
  if (hour < 4) {
    logical.setUTCDate(logical.getUTCDate() - 1);
  }
  return logical.getTime();
}

/**
 * Integer day index with 4:00 AM HKT rollover
 * (days since Unix epoch for the logical Y-M-D).
 */
export function getHKLogicalDayNumber(now: Date = new Date()): number {
  return Math.floor(getHKLogicalDayStartMs(now) / MS_PER_DAY);
}

/** YYYY-MM-DD for a Date/ISO using HKT logical day (4am boundary). */
export function toHKLogicalDateString(value: string | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(toUtcIso(value));
  if (Number.isNaN(date.getTime())) {
    return toHKLogicalDateString(new Date());
  }
  const ms = getHKLogicalDayStartMs(date);
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse YYYY-MM-DD as that HKT logical day's UTC midnight key. */
export function parseHKLogicalDateString(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

/**
 * Day N for a mentee (4:00 AM Asia/Hong_Kong rollover).
 * - Mentor-set `journey_start_date`: that calendar day is Day 1.
 * - Else account `created_at`: that calendar day is Day 0 (next logical day = Day 1).
 */
export function getJourneyDay(
  journeyStartDate: string | null | undefined,
  createdAt: string | null | undefined,
  now: Date = new Date(),
): number {
  const logicalMs = getHKLogicalDayStartMs(now);
  const explicitStart = journeyStartDate
    ? parseHKLogicalDateString(journeyStartDate)
    : null;

  if (explicitStart != null) {
    return Math.max(
      1,
      Math.floor((logicalMs - explicitStart) / MS_PER_DAY) + 1,
    );
  }

  const joinStart = createdAt
    ? getHKLogicalDayStartMs(new Date(toUtcIso(createdAt)))
    : getHKLogicalDayStartMs(now);

  return Math.max(0, Math.floor((logicalMs - joinStart) / MS_PER_DAY));
}

/** @deprecated Prefer getJourneyDay — kept for any leftover callers. */
export function getCampaignDay(now: Date = new Date()): number {
  const logicalMs = getHKLogicalDayStartMs(now);
  const day1Ms = Date.UTC(
    CAMPAIGN_DAY1.year,
    CAMPAIGN_DAY1.month - 1,
    CAMPAIGN_DAY1.day,
  );
  return Math.floor((logicalMs - day1Ms) / MS_PER_DAY) + 1;
}

/** e.g. "14 July, 2026" in Asia/Hong_Kong. */
export function formatMemberSince(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(toUtcIso(value));
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HK_TIMEZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(date);

  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  if (!day || !month || !year) return "";
  return `${day} ${month}, ${year}`;
}
