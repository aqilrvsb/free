// Very small in-memory demo store for tenants/users/routes.
// Replace with a real DB or config service later.
export const Tenants = [
  { id: 'tenant1', name: 'Tenant One', domain: 'tenant1.local' },
  { id: 'tenant2', name: 'Tenant Two', domain: 'tenant2.local' },
];

export const Users = [
  { id: '1001', tenantId: 'tenant1', password: '1001' },
  { id: '1002', tenantId: 'tenant1', password: '1002' },
  { id: '2001', tenantId: 'tenant2', password: '2001' },
];

// For more advanced routing (masking, PSTN, etc.)
// keep an object keyed by tenant.
export const Routing = {
  tenant1: {
    pstnGateway: 'pstn',
  },
  tenant2: {
    pstnGateway: 'pstn',
  },
};
