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

  const requestInit: RequestInit = {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      ...(customHeaders || {}),
    },
  };

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

  let response: Response;
  try {
    response = await fetch(url, requestInit);
  } catch (err) {
    return handleError(err);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(`API request failed (${response.status}): ${text}`);
    return handleError(error);
  }

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

export { API_BASE_URL };
