import { Controller, Get } from '@nestjs/common';
import { PORTAL_ROUTE_PERMISSIONS } from './portal-permissions';

@Controller('portal')
export class PortalConfigController {
  @Get('route-permissions')
  getRoutePermissions() {
    return {
      updatedAt: new Date().toISOString(),
      rules: PORTAL_ROUTE_PERMISSIONS,
    };
  }
}
