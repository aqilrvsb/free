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

export interface PortalRoutePermissionEntry {
  path: string;
  matcher?: 'exact' | 'prefix';
  permissions?: PortalPermissionKey[];
  roles?: Array<'viewer' | 'operator' | 'tenant_admin' | 'agent_lead' | 'agent' | 'super_admin' | 'admin'>;
}

export const PORTAL_ROUTE_PERMISSIONS: PortalRoutePermissionEntry[] = [
  {
    path: '/fs/manage',
    matcher: 'prefix',
    permissions: ['manage_tenants'],
    roles: ['super_admin'],
  },
  {
    path: '/fs/extensions',
    matcher: 'prefix',
    permissions: ['manage_extensions'],
  },
  {
    path: '/fs/agents',
    matcher: 'prefix',
    permissions: ['manage_agents'],
  },
  {
    path: '/fs/auto-dialer',
    matcher: 'prefix',
    permissions: ['manage_outbound'],
  },
  {
    path: '/fs/outbound/caller-ids',
    matcher: 'prefix',
    permissions: ['manage_outbound'],
    roles: ['super_admin', 'tenant_admin'],
  },
  {
    path: '/fs/outbound',
    matcher: 'prefix',
    permissions: ['manage_outbound'],
    roles: ['super_admin', 'tenant_admin'],
  },
  {
    path: '/fs/inbound',
    matcher: 'prefix',
    permissions: ['manage_inbound'],
    roles: ['super_admin', 'tenant_admin', 'operator'],
  },
  {
    path: '/fs/dialplan',
    matcher: 'prefix',
    permissions: ['manage_dialplan'],
    roles: ['super_admin'],
  },
  {
    path: '/fs/ivr',
    matcher: 'prefix',
    permissions: ['manage_ivr'],
    roles: ['super_admin', 'tenant_admin', 'operator'],
  },
  {
    path: '/fs/gateways',
    matcher: 'prefix',
    permissions: ['manage_gateways'],
    roles: ['super_admin'],
  },
  {
    path: '/fs/system-recordings',
    matcher: 'prefix',
    permissions: ['manage_recordings'],
    roles: ['super_admin', 'tenant_admin', 'operator'],
  },
  {
    path: '/fs/settings',
    matcher: 'prefix',
    permissions: ['manage_settings'],
    roles: ['super_admin', 'tenant_admin'],
  },
  {
    path: '/fs/billing',
    matcher: 'prefix',
    permissions: ['view_billing'],
  },
  {
    path: '/fs/status',
    matcher: 'prefix',
    permissions: ['view_channels'],
  },
  {
    path: '/fs/channels',
    matcher: 'prefix',
    permissions: ['view_channels'],
  },
  {
    path: '/fs/calls',
    matcher: 'prefix',
    permissions: ['view_calls'],
  },
  {
    path: '/fs/registrations',
    matcher: 'prefix',
    permissions: ['view_registrations'],
  },
  {
    path: '/cdr',
    matcher: 'prefix',
    permissions: ['view_cdr'],
  },
  {
    path: '/recordings',
    matcher: 'prefix',
    permissions: ['manage_recordings'],
  },
  {
    path: '/security',
    matcher: 'prefix',
    permissions: ['manage_security'],
    roles: ['super_admin'],
  },
  {
    path: '/admin/users',
    matcher: 'prefix',
    permissions: ['manage_portal_users'],
  },
  {
    path: '/admin/roles',
    matcher: 'prefix',
    permissions: ['manage_roles'],
    roles: ['super_admin'],
  },
];
