import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
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
    permissions?: string[];
    rolePermissions?: string[];
  };
}

@ApiTags(SwaggerTags.Tenant)
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'tenant_admin', 'agent_lead')
@Controller()
export class TenantManagementController {
  constructor(private readonly managementService: TenantManagementService) {}

  private resolveScope(req?: AuthenticatedRequest) {
    const user = req?.user;
    const role = user?.role || null;
    const tenantIds = Array.isArray(user?.tenantIds) ? user!.tenantIds : [];
    const permissionSources: string[] = [];
    if (Array.isArray(user?.permissions)) {
      permissionSources.push(...user!.permissions);
    }
    if (Array.isArray(user?.rolePermissions)) {
      permissionSources.push(...user!.rolePermissions);
    }
    const allowedPermissions = Array.from(
      new Set(
        permissionSources
          .filter((perm): perm is string => typeof perm === 'string')
          .map((perm) => perm.trim())
          .filter((perm) => perm.length > 0),
      ),
    );
    return {
      isSuperAdmin: role === 'super_admin',
      tenantIds,
      allowedPermissions,
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
    if (!scope.isSuperAdmin && !(scope.allowedPermissions?.includes('manage_extensions'))) {
      throw new ForbiddenException('Không có quyền quản lý extension');
    }
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
    const scope = this.resolveScope(req);
    if (!scope.isSuperAdmin && !(scope.allowedPermissions?.includes('manage_extensions'))) {
      throw new ForbiddenException('Không có quyền quản lý extension');
    }
    return this.managementService.createExtension(
      {
        ...body,
        id: body.id?.trim(),
        tenantId: body.tenantId?.trim(),
        password: body.password?.trim(),
        displayName: body.displayName?.trim(),
      },
      scope,
    );
  }

  @Put('/extensions/:id')
  async updateExtension(
    @Param() params: ExtensionIdParamDto,
    @Body() body: UpdateExtensionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const scope = this.resolveScope(req);
    if (!scope.isSuperAdmin && !(scope.allowedPermissions?.includes('manage_extensions'))) {
      throw new ForbiddenException('Không có quyền quản lý extension');
    }
    const tenantIdQuery =
      typeof req?.query?.tenantId === 'string' ? (req.query.tenantId as string).trim() : undefined;
    const payload: UpdateExtensionDto = {
      ...body,
      tenantId: body.tenantId?.trim() || tenantIdQuery,
      password: body.password?.trim(),
      displayName: body.displayName?.trim(),
    };
    return this.managementService.updateExtension(params.id, payload, scope);
  }

  @Delete('/extensions/:id')
  async deleteExtension(@Param() params: ExtensionIdParamDto, @Req() req: AuthenticatedRequest) {
    const scope = this.resolveScope(req);
    if (!scope.isSuperAdmin && !(scope.allowedPermissions?.includes('manage_extensions'))) {
      throw new ForbiddenException('Không có quyền quản lý extension');
    }
    const tenantId =
      typeof req?.query?.tenantId === 'string' ? (req.query.tenantId as string).trim() : undefined;
    await this.managementService.deleteExtension(params.id, scope, tenantId);
    return { success: true };
  }

  @Get('/extensions/:id/password')
  async getExtensionSecret(@Param() params: ExtensionIdParamDto, @Req() req: AuthenticatedRequest) {
    const scope = this.resolveScope(req);
    if (!scope.isSuperAdmin && !(scope.allowedPermissions?.includes('manage_extensions'))) {
      throw new ForbiddenException('Không có quyền quản lý extension');
    }
    const tenantId =
      typeof req?.query?.tenantId === 'string' ? (req.query.tenantId as string).trim() : undefined;
    return this.managementService.getExtensionSecret(params.id, scope, tenantId);
  }
}
