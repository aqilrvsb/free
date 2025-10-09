import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api";
import { resolveSecureFlag, sanitizeErrorMessage } from "../helpers";

interface RefreshResponsePayload {
  accessToken: string;
  user: Record<string, unknown>;
  refreshToken?: string;
  accessTokenExpiresIn?: number;
  refreshTokenExpiresIn?: number;
  [key: string]: unknown;
}

const ACCESS_MAX_AGE_DEFAULT = 60 * 60 * 12;
const REFRESH_MAX_AGE_DEFAULT = 60 * 60 * 24 * 7;

function clearSessionCookies(response: NextResponse, secure: boolean) {
  const baseOptions = {
    sameSite: "lax" as const,
    secure,
    path: "/",
  };
  response.cookies.set("portal_token", "", { ...baseOptions, httpOnly: false, maxAge: 0 });
  response.cookies.set("portal_user", "", { ...baseOptions, httpOnly: false, maxAge: 0 });
  response.cookies.set("portal_refresh", "", { ...baseOptions, httpOnly: true, maxAge: 0 });
}

export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get("portal_refresh")?.value;
  if (!refreshToken) {
    const response = NextResponse.json({ message: "Không có refresh token" }, { status: 401 });
    const secure = resolveSecureFlag(request);
    clearSessionCookies(response, secure);
    return response;
  }

  try {
    const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    const secure = resolveSecureFlag(request);

    if (!refreshResponse.ok) {
      const message = sanitizeErrorMessage(await refreshResponse.text());
      const failure = NextResponse.json({ message }, { status: refreshResponse.status });
      clearSessionCookies(failure, secure);
      return failure;
    }

    const payload = (await refreshResponse.json()) as RefreshResponsePayload;
    if (!payload?.accessToken || !payload?.user) {
      const failure = NextResponse.json({ message: "Dữ liệu refresh không hợp lệ" }, { status: 502 });
      clearSessionCookies(failure, secure);
      return failure;
    }

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

    const response = NextResponse.json({
      accessToken: payload.accessToken,
      user: payload.user,
    });

    response.cookies.set("portal_token", payload.accessToken, accessCookieOptions);
    response.cookies.set("portal_user", encodeURIComponent(JSON.stringify(payload.user)), accessCookieOptions);
    if (payload.refreshToken) {
      response.cookies.set("portal_refresh", payload.refreshToken, refreshCookieOptions);
    }

    return response;
  } catch (error) {
    const message = sanitizeErrorMessage(error);
    const response = NextResponse.json({ message }, { status: 500 });
    const secure = resolveSecureFlag(request);
    clearSessionCookies(response, secure);
    return response;
  }
}
