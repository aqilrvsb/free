export const SwaggerTags = {
  Auth: 'Auth',
  FreeSWITCH: 'FreeSWITCH',
  IVR: 'IVR',
  Portal: 'Portal',
  Routing: 'Routing',
  Telephony: 'Telephony',
  Tenant: 'Tenant Management',
  Security: 'Security',
  Agents: 'Agent Management',
  AutoDialer: 'Auto Dialer',
  External: 'External Integrations',
} as const;

export type SwaggerTag = (typeof SwaggerTags)[keyof typeof SwaggerTags];
