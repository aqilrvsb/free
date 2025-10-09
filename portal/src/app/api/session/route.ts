import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api";
import { resolveSecureFlag, sanitizeErrorMessage } from "./helpers";

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
  refreshToken?: string;
  accessTokenExpiresIn?: number;
  refreshTokenExpiresIn?: number;
  [key: string]: unknown;
}

const ACCESS_MAX_AGE_DEFAULT = 60 * 60 * 12; // 12 hours fallback
const REFRESH_MAX_AGE_DEFAULT = 60 * 60 * 24 * 7; // 7 days fallback

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
    const accessMaxAge = Math.max(60, Math.floor(payload.accessTokenExpiresIn ?? ACCESS_MAX_AGE_DEFAULT));
    const refreshMaxAge = Math.max(60, Math.floor(payload.refreshTokenExpiresIn ?? REFRESH_MAX_AGE_DEFAULT));

    const accessCookieOptions = {
      httpOnly: false,
      sameSite: "lax" as const,
      secure,
      path: "/",
      maxAge: accessMaxAge,
    };

    const refreshCookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure,
      path: "/",
      maxAge: refreshMaxAge,
    };

    const responseBody = NextResponse.json({
      accessToken: payload.accessToken,
      user: payload.user,
    });

    responseBody.cookies.set("portal_token", payload.accessToken, accessCookieOptions);
    responseBody.cookies.set("portal_user", encodeURIComponent(JSON.stringify(payload.user)), accessCookieOptions);
    if (payload.refreshToken) {
      responseBody.cookies.set("portal_refresh", payload.refreshToken, refreshCookieOptions);
    }

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
  response.cookies.set("portal_refresh", "", { ...cookieOptions, httpOnly: true });

  const refreshToken = request.cookies.get("portal_refresh")?.value;
  if (refreshToken) {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch (error) {
      console.warn("[session] Logout notify failed", error);
    }
  }
  return response;
}
