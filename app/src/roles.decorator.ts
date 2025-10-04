import { SetMetadata } from '@nestjs/common';

export type PortalRole = 'admin' | 'viewer';

export const ROLES_KEY = 'portal_roles';

export const Roles = (...roles: PortalRole[]) => SetMetadata(ROLES_KEY, roles);
