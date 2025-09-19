export interface SeedTenant {
  id: string;
  name: string;
  domain: string;
}

export interface SeedUser {
  id: string;
  tenantId: string;
  password: string;
  displayName?: string;
}

export interface SeedRoutingConfig {
  tenantId: string;
  internalPrefix: string;
  voicemailPrefix: string;
  pstnGateway: string;
  enableE164: boolean;
  codecString?: string;
}

export const SeedTenants: SeedTenant[] = [
  { id: 'tenant1', name: 'Tenant One', domain: 'tenant1.local' },
  { id: 'tenant2', name: 'Tenant Two', domain: 'tenant2.local' },
];

export const SeedUsers: SeedUser[] = [
  { id: '1001', tenantId: 'tenant1', password: '1001', displayName: 'Tenant1 User 1001' },
  { id: '1002', tenantId: 'tenant1', password: '1002', displayName: 'Tenant1 User 1002' },
  { id: '2001', tenantId: 'tenant2', password: '2001', displayName: 'Tenant2 User 2001' },
];

export const SeedRouting: SeedRoutingConfig[] = [
  {
    tenantId: 'tenant1',
    internalPrefix: '9',
    voicemailPrefix: '*9',
    pstnGateway: 'pstn',
    enableE164: true,
    codecString: 'PCMU,PCMA,G722,OPUS',
  },
  {
    tenantId: 'tenant2',
    internalPrefix: '8',
    voicemailPrefix: '*8',
    pstnGateway: 'pstn',
    enableE164: true,
    codecString: 'PCMU,PCMA,G722,OPUS',
  },
];
