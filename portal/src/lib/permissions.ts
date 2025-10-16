import type { PortalUserSummary } from "@/lib/types";

export type PermissionKey =
  | "view_dashboard"
  | "view_cdr"
  | "view_recordings"
  | "view_channels"
  | "view_calls"
  | "view_registrations"
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
  | "manage_security"
  | "view_billing"
  | "manage_billing"
  | "manage_agents"
  | "manage_sub_agents"
  | "manage_own_groups";

type PermissionSet = Record<PermissionKey, boolean>;

const BASE_PERMISSIONS: PermissionSet = {
  view_dashboard: true,
  view_cdr: false,
  view_recordings: false,
  view_channels: false,
  view_calls: false,
  view_registrations: false,
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
  view_billing: false,
  manage_billing: false,
  manage_agents: false,
  manage_sub_agents: false,
  manage_own_groups: false,
};

const ROLE_MATRIX: Record<string, Partial<PermissionSet>> = {
  viewer: {
    ...BASE_PERMISSIONS,
    view_cdr: true,
    view_recordings: true,
    view_channels: true,
    view_calls: true,
    view_registrations: true,
    view_billing: true,
  },
  operator: {
    ...BASE_PERMISSIONS,
    view_cdr: true,
    view_recordings: true,
    manage_inbound: true,
    manage_outbound: true,
    manage_ivr: true,
    manage_recordings: true,
    view_channels: true,
    view_calls: true,
    view_registrations: true,
    view_billing: true,
  },
  tenant_admin: {
    ...BASE_PERMISSIONS,
    view_cdr: true,
    view_recordings: true,
    view_channels: true,
    view_calls: true,
    view_registrations: true,
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
    view_billing: true,
    manage_billing: false,
    manage_agents: true,
    manage_sub_agents: true,
    manage_own_groups: true,
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
  agent_lead: {
    ...BASE_PERMISSIONS,
    view_cdr: true,
    view_recordings: true,
    view_channels: true,
    view_registrations: true,
    view_calls: true,
    manage_agents: true,
    manage_portal_users: true,
    manage_sub_agents: true,
    manage_own_groups: true,
    manage_extensions: true,
  },
  agent: {
    ...BASE_PERMISSIONS,
    view_cdr: true,
    view_recordings: true,
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
