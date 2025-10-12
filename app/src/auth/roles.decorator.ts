import { SetMetadata } from '@nestjs/common';

export type PortalRole = 'super_admin' | 'tenant_admin' | 'operator' | 'viewer' | 'agent_lead' | 'agent';

export const ROLES_KEY = 'portal_roles';

export const Roles = (...roles: PortalRole[]) => SetMetadata(ROLES_KEY, roles);
