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
} as const;

export type SwaggerTag = (typeof SwaggerTags)[keyof typeof SwaggerTags];
