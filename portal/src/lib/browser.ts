export function resolveClientBaseUrl(envValue?: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.host}`;
  }
  if (envValue && envValue.length > 0) {
    return envValue.replace(/\/$/, "");
  }
  return "";
}

export function resolveClientWsUrl(envValue?: string): string {
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  if (envValue && envValue.length > 0) {
    return envValue.replace(/\/$/, "");
  }
  return "";
}
