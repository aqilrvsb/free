import type { PortalUserSummary } from "@/lib/types";

export type PermissionKey =
  | "view_dashboard"
  | "view_cdr"
  | "view_recordings"
  | "view_channels"
  | "manage_gateways"
  | "manage_tenants"
  | "manage_dialplan"
  | "manage_inbound"
  | "manage_outbound"
  | "manage_ivr"
  | "manage_settings"
  | "manage_recordings"
  | "manage_extensions"
  | "manage_portal_users"
  | "manage_roles"
  | "manage_security";

type PermissionSet = Record<PermissionKey, boolean>;

const BASE_PERMISSIONS: PermissionSet = {
  view_dashboard: true,
  view_cdr: true,
  view_recordings: true,
  view_channels: true,
  manage_gateways: false,
  manage_tenants: false,
  manage_dialplan: false,
  manage_inbound: false,
  manage_outbound: false,
  manage_ivr: false,
  manage_settings: false,
  manage_recordings: false,
  manage_extensions: false,
  manage_portal_users: false,
  manage_roles: false,
  manage_security: false,
};

const ROLE_MATRIX: Record<string, Partial<PermissionSet>> = {
  viewer: { ...BASE_PERMISSIONS },
  operator: {
    ...BASE_PERMISSIONS,
    manage_inbound: true,
    manage_outbound: true,
    manage_ivr: true,
    manage_recordings: true,
  },
  tenant_admin: {
    ...BASE_PERMISSIONS,
    manage_gateways: true,
    manage_dialplan: true,
    manage_inbound: true,
    manage_outbound: true,
    manage_ivr: true,
    manage_settings: true,
    manage_recordings: true,
    manage_extensions: true,
    manage_portal_users: true,
    manage_security: false,
  },
  super_admin: {
    ...Object.keys(BASE_PERMISSIONS).reduce((acc, key) => {
      acc[key as PermissionKey] = true;
      return acc;
    }, {} as PermissionSet),
  },
  admin: {
    ...Object.keys(BASE_PERMISSIONS).reduce((acc, key) => {
      acc[key as PermissionKey] = true;
      return acc;
    }, {} as PermissionSet),
  },
};

export function resolvePermissions(user: PortalUserSummary | null | undefined): PermissionSet {
  const result: PermissionSet = { ...BASE_PERMISSIONS };

  if (!user) {
    return result;
  }

  if (Array.isArray(user.rolePermissions) && user.rolePermissions.length > 0) {
    for (const key of user.rolePermissions) {
      if (key in result) {
        result[key as PermissionKey] = true;
      }
    }
  } else if (user.role) {
    const matrix = ROLE_MATRIX[user.role] || ROLE_MATRIX.viewer;
    Object.entries(matrix).forEach(([key, value]) => {
      result[key as PermissionKey] = Boolean(value);
    });
  }

  if (Array.isArray(user.permissions)) {
    for (const key of user.permissions) {
      if (key in result) {
        result[key as PermissionKey] = true;
      }
    }
  }

  return result;
}

export function hasPermission(user: PortalUserSummary | null | undefined, permission: PermissionKey): boolean {
  const permissions = resolvePermissions(user);
  return Boolean(permissions[permission]);
}

export function filterPathsByPermission(paths: Array<{ href: string; permission?: PermissionKey }>, user: PortalUserSummary | null) {
  const permissions = resolvePermissions(user);
  return paths.filter((item) => {
    if (!item.permission) {
      return true;
    }
    return Boolean(permissions[item.permission]);
  });
}
