function normalizeUrl(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function resolveClientBaseUrl(envValue?: string): string {
  if (envValue && envValue.length > 0) {
    return normalizeUrl(envValue);
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.host}`;
  }
  return '';
}

export function resolveClientWsUrl(envValue?: string): string {
  if (envValue && envValue.length > 0) {
    return normalizeUrl(envValue);
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  return '';
}
