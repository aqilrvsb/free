function normalizePermissions(source?: string[] | null): string[] {
  if (!Array.isArray(source) || source.length === 0) {
    return [];
  }
  const normalized = new Set<string>();
  for (const raw of source) {
    if (typeof raw !== 'string') {
      continue;
    }
    const value = raw.trim();
    if (!value) {
      continue;
    }
    normalized.add(value);
  }
  return Array.from(normalized.values());
}

export function resolveEffectivePermissions(user?: { permissions?: string[] | null; rolePermissions?: string[] | null }): string[] {
  const personal = normalizePermissions(user?.permissions);
  if (personal.length > 0) {
    return personal;
  }
  return normalizePermissions(user?.rolePermissions);
}

export function buildAllowedPermissionSet(user?: { permissions?: string[] | null; rolePermissions?: string[] | null }): Set<string> {
  return new Set(resolveEffectivePermissions(user));
}
