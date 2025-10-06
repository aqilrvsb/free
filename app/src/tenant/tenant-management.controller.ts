import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TenantManagementService } from './tenant-management.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import { SwaggerTags } from '../swagger/swagger-tags';
import {
  CreateExtensionDto,
  CreateTenantDto,
  ExtensionIdParamDto,
  ListExtensionsQueryDto,
  ListTenantsQueryDto,
  TenantIdParamDto,
  UpdateExtensionDto,
  UpdateTenantDto,
} from './dto';

interface AuthenticatedRequest extends Request {
  user?: {
    role?: string;
    tenantIds?: string[];
  };
}

@ApiTags(SwaggerTags.Tenant)
@ApiBearerAuth('jwt')
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
  async listTenants(@Query() query: ListTenantsQueryDto, @Req() req?: AuthenticatedRequest) {
    const page = Number(query.page ?? 0) || 0;
    const pageSize = Number(query.pageSize ?? 0) || 0;
    const search = query.search?.trim();
    const scope = this.resolveScope(req);
    if (page > 0 && pageSize > 0) {
      return this.managementService.listTenantsPaginated({ page, pageSize, search }, scope);
    }
    return this.managementService.listTenants({ search }, scope);
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
  async createTenant(@Body() body: CreateTenantDto) {
    return this.managementService.createTenant(body);
  }

  @Put('/tenants/:id')
  async updateTenant(
    @Param() params: TenantIdParamDto,
    @Body() body: UpdateTenantDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.managementService.updateTenant(params.id, body, this.resolveScope(req));
  }

  @Roles('super_admin')
  @Delete('/tenants/:id')
  async deleteTenant(@Param() params: TenantIdParamDto) {
    await this.managementService.deleteTenant(params.id);
    return { success: true };
  }

  @Get('/extensions')
  async listExtensions(@Query() query: ListExtensionsQueryDto, @Req() req?: AuthenticatedRequest) {
    const tenantId = query.tenantId?.trim() || undefined;
    const search = query.search?.trim() || undefined;
    const page = Number(query.page ?? 0) || 0;
    const pageSize = Number(query.pageSize ?? 0) || 0;
    const scope = this.resolveScope(req);
    if (page > 0 && pageSize > 0) {
      return this.managementService.listExtensionsPaginated({
        tenantId,
        search,
        page,
        pageSize,
      }, scope);
    }
    return this.managementService.listExtensions(tenantId, search, scope);
  }

  @Post('/extensions')
  async createExtension(@Body() body: CreateExtensionDto, @Req() req: AuthenticatedRequest) {
    return this.managementService.createExtension(body, this.resolveScope(req));
  }

  @Put('/extensions/:id')
  async updateExtension(
    @Param() params: ExtensionIdParamDto,
    @Body() body: UpdateExtensionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.managementService.updateExtension(params.id, body, this.resolveScope(req));
  }

  @Delete('/extensions/:id')
  async deleteExtension(@Param() params: ExtensionIdParamDto, @Req() req: AuthenticatedRequest) {
    await this.managementService.deleteExtension(params.id, this.resolveScope(req));
    return { success: true };
  }

  @Get('/extensions/:id/password')
  async getExtensionSecret(@Param() params: ExtensionIdParamDto, @Req() req: AuthenticatedRequest) {
    return this.managementService.getExtensionSecret(params.id, this.resolveScope(req));
  }
}
