import { cookies } from "next/headers";
import { FALLBACK_TIMEZONE, TIMEZONE_COOKIE, normalizeTimezone } from "@/lib/timezone";

export async function getServerTimezone(): Promise<string> {
  const cookieStore = await cookies();
  const timezoneCookie = cookieStore.get(TIMEZONE_COOKIE)?.value;
  if (!timezoneCookie) {
    return normalizeTimezone(FALLBACK_TIMEZONE);
  }
  return normalizeTimezone(timezoneCookie);
}
