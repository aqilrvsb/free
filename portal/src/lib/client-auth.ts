export function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const raw = document.cookie
    .split(";")
    .map((chunk) => chunk.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!raw) {
    return null;
  }
  const value = raw.slice(name.length + 1);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function getPortalToken(): string | null {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage?.getItem("portal_token");
      if (stored) {
        return stored;
      }
    } catch (error) {
      console.warn("[client-auth] unable to read localStorage token", error);
    }
  }
  return readCookie("portal_token");
}

export function buildAuthHeaders(isJson = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (isJson) {
    headers["Content-Type"] = "application/json";
  }
  const token = getPortalToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
