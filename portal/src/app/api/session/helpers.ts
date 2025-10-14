import { NextRequest } from "next/server";

export function resolveSecureFlag(request: NextRequest): boolean {
  const preference = (process.env.PORTAL_COOKIE_SECURE || "").toLowerCase();
  if (preference === "true") {
    return true;
  }
  if (preference === "false") {
    return false;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto?.toLowerCase().includes("https")) {
    return true;
  }

  const forwarded = request.headers.get("forwarded");
  if (forwarded?.toLowerCase().includes("proto=https")) {
    return true;
  }

  const protocol = request.nextUrl.protocol.toLowerCase();
  if (protocol === "https:" || protocol === "wss:") {
    return true;
  }
  if (protocol === "http:" || protocol === "ws:") {
    return false;
  }

  return process.env.NODE_ENV === "production";
}

export function sanitizeErrorMessage(error: unknown): string {
  if (!error) {
    return "Đăng nhập thất bại";
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    const parsed = JSON.parse(String(error)) as { message?: unknown };
    if (parsed && typeof parsed === "object" && parsed.message) {
      if (Array.isArray(parsed.message)) {
        return parsed.message.join(", ");
      }
      if (typeof parsed.message === "string") {
        return parsed.message;
      }
    }
  } catch {
    // ignore
  }
  return "Đăng nhập thất bại";
}
