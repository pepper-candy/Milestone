type InvalidateFn = (mode: "now" | "next") => void;

let invalidateFn: InvalidateFn | null = null;

/** Register the soft-nav shell's dashboard cache clearer. */
export function registerSoftDashboardInvalidator(fn: InvalidateFn | null) {
  invalidateFn = fn;
}

/**
 * Drop the kept-alive dashboard immediately (e.g. mentee switch) so the next
 * /dashboard render mounts fresh server props.
 */
export function invalidateSoftDashboard() {
  invalidateFn?.("now");
}

/**
 * Remount dashboard with fresh props the next time /dashboard is shown
 * (e.g. after nickname/avatar save) without killing it while still on profile.
 */
export function markSoftDashboardStale() {
  invalidateFn?.("next");
}
