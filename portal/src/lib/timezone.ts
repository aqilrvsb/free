const COOKIE_NAME = "pbx_timezone";
const DEFAULT_TIMEZONE =
  process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || process.env.PORTAL_DEFAULT_TIMEZONE || process.env.TZ || "UTC";

export const TIMEZONE_COOKIE = COOKIE_NAME;
export const FALLBACK_TIMEZONE = DEFAULT_TIMEZONE;

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function normalizeTimezone(value?: string | null): string {
  if (!value) {
    return FALLBACK_TIMEZONE;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return FALLBACK_TIMEZONE;
  }
  return isValidTimezone(trimmed) ? trimmed : FALLBACK_TIMEZONE;
}

export function formatWithTimezone(
  input: string | number | Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "medium" },
  locale = "vi-VN",
): string {
  const date = typeof input === "string" || typeof input === "number" ? new Date(input) : input;
  if (!date || Number.isNaN(date.getTime?.() ?? Number.NaN)) {
    return typeof input === "string" ? input : "";
  }
  try {
    return new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { timeZone: FALLBACK_TIMEZONE, ...options }).format(date);
  }
}
