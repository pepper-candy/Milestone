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
