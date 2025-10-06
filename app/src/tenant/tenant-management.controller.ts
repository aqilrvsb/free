import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TenantManagementService } from './tenant-management.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    role?: string;
    tenantIds?: string[];
  };
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'tenant_admin')
@Controller()
export class TenantManagementController {
  constructor(private readonly managementService: TenantManagementService) {}

  private resolveScope(req?: AuthenticatedRequest) {
    const user = req?.user;
    const role = user?.role || null;
    const tenantIds = Array.isArray(user?.tenantIds) ? user!.tenantIds : [];
    return {
      isSuperAdmin: role === 'super_admin',
      tenantIds,
    };
  }

  @Get('/tenants')
  async listTenants(
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(0), ParseIntPipe) pageSize: number,
    @Query('search') search?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    const scope = this.resolveScope(req);
    if (page > 0 && pageSize > 0) {
      return this.managementService.listTenantsPaginated({ page, pageSize, search: search?.trim() }, scope);
    }
    return this.managementService.listTenants({ search: search?.trim() }, scope);
  }

  @Get('/tenants/options')
  async tenantOptions(@Req() req: AuthenticatedRequest) {
    return this.managementService.listTenantOptions(this.resolveScope(req));
  }

  @Get('/tenants/metrics')
  async tenantMetrics(@Req() req: AuthenticatedRequest) {
    return this.managementService.getTenantMetrics(this.resolveScope(req));
  }

  @Roles('super_admin')
  @Post('/tenants')
  async createTenant(
    @Body()
    body: {
      id?: string;
      name: string;
      domain: string;
      internalPrefix?: string;
      voicemailPrefix?: string;
      pstnGateway?: string;
      enableE164?: boolean;
      codecString?: string;
    },
  ) {
    return this.managementService.createTenant(body);
  }

  @Put('/tenants/:id')
  async updateTenant(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      domain?: string;
      internalPrefix?: string;
      voicemailPrefix?: string;
      pstnGateway?: string;
      enableE164?: boolean;
      codecString?: string;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.managementService.updateTenant(id, body, this.resolveScope(req));
  }

  @Roles('super_admin')
  @Delete('/tenants/:id')
  async deleteTenant(@Param('id') id: string) {
    await this.managementService.deleteTenant(id);
    return { success: true };
  }

  @Get('/extensions')
  async listExtensions(
    @Query('tenantId') tenantId?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number = 0,
    @Query('pageSize', new DefaultValuePipe(0), ParseIntPipe) pageSize: number = 0,
    @Req() req?: AuthenticatedRequest,
  ) {
    const normalizedTenantId = tenantId?.trim() || undefined;
    const normalizedSearch = search?.trim() || undefined;
    const scope = this.resolveScope(req);
    if (page > 0 && pageSize > 0) {
      return this.managementService.listExtensionsPaginated({
        tenantId: normalizedTenantId,
        search: normalizedSearch,
        page,
        pageSize,
      }, scope);
    }
    return this.managementService.listExtensions(normalizedTenantId, normalizedSearch, scope);
  }

  @Post('/extensions')
  async createExtension(
    @Body()
    body: { id: string; tenantId: string; password?: string; displayName?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.managementService.createExtension(body, this.resolveScope(req));
  }

  @Put('/extensions/:id')
  async updateExtension(
    @Param('id') id: string,
    @Body()
    body: { password?: string; displayName?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.managementService.updateExtension(id, body, this.resolveScope(req));
  }

  @Delete('/extensions/:id')
  async deleteExtension(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    await this.managementService.deleteExtension(id, this.resolveScope(req));
    return { success: true };
  }

  @Get('/extensions/:id/password')
  async getExtensionSecret(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.managementService.getExtensionSecret(id, this.resolveScope(req));
  }
}
