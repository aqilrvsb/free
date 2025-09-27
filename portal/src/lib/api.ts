const API_BASE_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000";

type FetchOptions = Omit<RequestInit, "cache" | "next"> & {
  revalidate?: number;
  cache?: RequestCache;
  tags?: string[];
};

function buildUrl(path: string): string {
  if (path.startsWith("http")) {
    return path;
  }
  const base = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const {
    revalidate = 10,
    cache,
    tags,
    headers: customHeaders,
    ...fetchOptions
  } = options;
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

  const response = await fetch(url, requestInit);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API request failed (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export { API_BASE_URL };
