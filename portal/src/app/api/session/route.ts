import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api";

interface LoginRequestBody {
  email?: string;
  password?: string;
}

interface LoginResponsePayload {
  accessToken: string;
  user: {
    id: string;
    email: string;
    displayName?: string | null;
    role: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function resolveSecureFlag(request: NextRequest): boolean {
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

  return process.env.NODE_ENV === "production";
}

function sanitizeErrorMessage(error: unknown): string {
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

export async function POST(request: NextRequest) {
  let body: LoginRequestBody;
  try {
    body = (await request.json()) as LoginRequestBody;
  } catch {
    return NextResponse.json({ message: "Payload không hợp lệ" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();

  if (!email || !password) {
    return NextResponse.json({ message: "Email và mật khẩu là bắt buộc" }, { status: 400 });
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const message = sanitizeErrorMessage(await response.text());
      return NextResponse.json({ message }, { status: response.status || 400 });
    }

    const payload = (await response.json()) as LoginResponsePayload;
    if (!payload?.accessToken || !payload?.user) {
      return NextResponse.json({ message: "Dữ liệu đăng nhập không hợp lệ" }, { status: 502 });
    }

    const secure = resolveSecureFlag(request);
    const cookieOptions = {
      httpOnly: false,
      sameSite: "lax" as const,
      secure,
      path: "/",
      maxAge: MAX_AGE_SECONDS,
    };

    const responseBody = NextResponse.json({
      accessToken: payload.accessToken,
      user: payload.user,
    });

    responseBody.cookies.set("portal_token", payload.accessToken, cookieOptions);
    responseBody.cookies.set("portal_user", encodeURIComponent(JSON.stringify(payload.user)), cookieOptions);

    return responseBody;
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const secure = resolveSecureFlag(request);
  const cookieOptions = {
    httpOnly: false,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 0,
  };

  const response = NextResponse.json({ success: true });
  response.cookies.set("portal_token", "", cookieOptions);
  response.cookies.set("portal_user", "", cookieOptions);
  return response;
}