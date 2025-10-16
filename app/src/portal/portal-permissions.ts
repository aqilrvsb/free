export const PORTAL_PERMISSIONS = [
  'view_dashboard',
  'view_cdr',
  'view_recordings',
  'view_channels',
  'view_registrations',
  'view_calls',
  'manage_gateways',
  'manage_tenants',
  'manage_dialplan',
  'manage_inbound',
  'manage_outbound',
  'manage_ivr',
  'manage_settings',
  'manage_recordings',
  'manage_extensions',
  'manage_portal_users',
  'manage_roles',
  'manage_security',
  'view_billing',
  'manage_billing',
  'manage_agents',
  'manage_sub_agents',
  'manage_own_groups',
] as const;

export type PortalPermissionKey = (typeof PORTAL_PERMISSIONS)[number];

export const PORTAL_PERMISSION_SET = new Set<string>(PORTAL_PERMISSIONS);
