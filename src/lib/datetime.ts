/**
 * Every timestamp in this app should read in Philippine time regardless of
 * where it's rendered — the server (Vercel, UTC) and a viewer's browser
 * (Philippines, UTC+8) otherwise disagree on both the clock *and* the
 * calendar day for roughly 8 hours out of every 24 (see the "Generated on"
 * hydration-mismatch fix in DocumentModals.tsx). Passing `timeZone:
 * "Asia/Manila"` explicitly — instead of leaving it to whichever machine
 * happens to be formatting — makes server and client compute the exact
 * same string, which fixes that mismatch at the root rather than just
 * suppressing the warning it causes.
 */
// src/lib/datetime.ts

/**
 * Today's calendar date in Philippine time, as "YYYY-MM-DD" — the exact
 * shape a <input type="date"> reads and writes, so it can be compared
 * against dateNeeded as a plain string.
 *
 * Built from the formatted parts rather than toISOString() (UTC), for the
 * same reason the rest of this file pins the zone: a request filed at 7am
 * in Manila is still "yesterday" in UTC, so a UTC-derived today would
 * wrongly reject a legitimate same-day request. en-CA formats as
 * YYYY-MM-DD directly, so no manual padding is needed.
 */

export function todayPh(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: PH_TIME_ZONE });
}

const PH_TIME_ZONE = "Asia/Manila";

/** e.g. "September 17, 2026" */
export function formatPhDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    timeZone: PH_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** e.g. "Sep 17, 2026, 1:25 PM" — used for the System Logs audit trail, where the exact time (not just the date) matters. */
export function formatPhDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: PH_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
