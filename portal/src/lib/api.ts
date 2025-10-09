const API_BASE_URL =
  process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

type BaseFetchOptions = Omit<RequestInit, "cache" | "next"> & {
  revalidate?: number;
  cache?: RequestCache;
  tags?: string[];
};

export type FetchOptions<T> = BaseFetchOptions & {
  fallbackValue?: T;
  suppressError?: boolean;
  onError?: (error: Error) => void;
};

function buildUrl(path: string): string {
  if (path.startsWith("http")) {
    return path;
  }
  const base = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

async function resolveAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") {
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      return cookieStore.get("portal_token")?.value ?? null;
    } catch (error) {
      console.warn("[apiFetch] Unable to read cookies on server", error);
      return null;
    }
  }

  try {
    let token = window.localStorage?.getItem("portal_token") ?? null;
    if (!token) {
      const cookieMatch = document.cookie
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("portal_token="));
      if (cookieMatch) {
        token = decodeURIComponent(cookieMatch.split("=")[1]);
      }
    }
    return token;
  } catch (error) {
    console.warn("[apiFetch] Unable to resolve client token", error);
    return null;
  }
}

function updateClientTokenStorage(accessToken: string, user?: Record<string, unknown>) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage?.setItem("portal_token", accessToken);
  } catch (error) {
    console.warn("[apiFetch] Unable to persist access token", error);
  }
  if (user) {
    try {
      window.localStorage?.setItem("portal_user", JSON.stringify(user));
    } catch (error) {
      console.warn("[apiFetch] Unable to persist user info", error);
    }
  }
}

async function requestClientRefresh(): Promise<boolean> {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const response = await fetch("/api/session/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) {
      return false;
    }
    const payload = (await response.json()) as { accessToken?: string; user?: Record<string, unknown> };
    if (!payload?.accessToken) {
      return false;
    }
    updateClientTokenStorage(payload.accessToken, payload.user);
    return true;
  } catch (error) {
    console.warn("[apiFetch] Refresh request failed", error);
    return false;
  }
}

export async function apiFetch<T>(path: string, options?: FetchOptions<T>): Promise<T> {
  const opts = options ?? {};
  const {
    revalidate = 10,
    cache,
    tags,
    fallbackValue,
    suppressError = false,
    onError,
    headers: customHeaders,
    ...fetchOptions
  } = opts;
  const url = buildUrl(path);

  const nextConfig: Record<string, unknown> = {};
  if (Array.isArray(tags) && tags.length > 0) {
    nextConfig.tags = tags;
  }

  if (cache !== "no-store" && typeof revalidate === "number") {
    nextConfig.revalidate = revalidate;
  }

  const headers = new Headers({ "Content-Type": "application/json" });

  if (customHeaders) {
    if (customHeaders instanceof Headers) {
      customHeaders.forEach((value, key) => headers.set(key, value));
    } else if (Array.isArray(customHeaders)) {
      customHeaders.forEach(([key, value]) => headers.set(key, value));
    } else {
      Object.entries(customHeaders).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          headers.set(key, value.join(","));
        } else if (value !== undefined) {
          headers.set(key, String(value));
        }
      });
    }
  }

  const requestInit: RequestInit = {
    ...fetchOptions,
    headers,
  };

  let authToken = await resolveAuthToken();

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  if (cache) {
    requestInit.cache = cache;
  }

  if (Object.keys(nextConfig).length > 0) {
    requestInit.next = nextConfig;
  }

  const handleError = (err: unknown): T => {
    const error = err instanceof Error ? err : new Error(String(err));
    if (onError) {
      try {
        onError(error);
      } catch (hookError) {
        console.error("[apiFetch] onError handler threw an error", hookError);
      }
    } else {
      console.warn("[apiFetch]", error.message);
    }

    if (!suppressError && typeof fallbackValue === "undefined") {
      throw error;
    }

    const fallbackResult = (typeof fallbackValue === "undefined" ? undefined : fallbackValue) as T;
    return fallbackResult;
  };

  let attemptedRefresh = false;
  while (true) {
    let response: Response;
    try {
      response = await fetch(url, requestInit);
    } catch (err) {
      return handleError(err);
    }

    if (response.ok) {
      if (response.status === 204) {
        const fallbackResult = (typeof fallbackValue === "undefined" ? undefined : fallbackValue) as T;
        return fallbackResult;
      }
      try {
        return (await response.json()) as T;
      } catch (err) {
        return handleError(err);
      }
    }

    if (response.status === 401 && !attemptedRefresh && typeof window !== "undefined") {
      const refreshed = await requestClientRefresh();
      if (refreshed) {
        attemptedRefresh = true;
        authToken = await resolveAuthToken();
        if (authToken) {
          headers.set("Authorization", `Bearer ${authToken}`);
        } else {
          headers.delete("Authorization");
        }
        continue;
      }
    }

    const text = await response.text().catch(() => "");
    const error = new Error(`API request failed (${response.status}): ${text}`);
    return handleError(error);
  }
}

export { API_BASE_URL };
