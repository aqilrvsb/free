import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FsManagementService } from './fs-management.service';
import { SwaggerTags } from '../swagger/swagger-tags';
import { ChannelUuidParamDto, SofiaProfileParamDto, SofiaRegistrationsQueryDto } from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';
import { PortalUsersService } from '../portal/portal-users.service';
import { TenantManagementService } from '../tenant/tenant-management.service';

@ApiTags(SwaggerTags.FreeSWITCH)
@Controller('fs')
export class FsManagementController {
  constructor(
    private readonly fsManagementService: FsManagementService,
    private readonly portalUsersService: PortalUsersService,
    private readonly tenantManagementService: TenantManagementService,
  ) {}

  @Get('status')
  async status() {
    return this.fsManagementService.getCoreStatus();
  }

  @Get('sofia')
  async sofiaStatus() {
    return this.fsManagementService.getSofiaStatus();
  }

  @Get('sofia/:profile/registrations')
  @UseGuards(JwtAuthGuard)
  async sofiaRegistrations(
    @Param() params: SofiaProfileParamDto,
    @Query() query: SofiaRegistrationsQueryDto,
    @Req() req: Request & { user?: any },
  ) {
    const authUser = req.user;
    if (!authUser) {
      throw new ForbiddenException('Phiên đăng nhập không hợp lệ');
    }

    const access = await this.portalUsersService.resolveRealtimeAccess(authUser.id || authUser.sub);
    const allowedPermissions = this.extractAllowedPermissions(authUser);
    if (!access.isSuperAdmin && !allowedPermissions.has('view_registrations')) {
      throw new ForbiddenException('Không có quyền truy cập dữ liệu đăng ký');
    }
    if (access.isAgentLead && !access.agentId) {
      throw new ForbiddenException('Không có quyền truy cập dữ liệu đăng ký');
    }
    const queryDomain = typeof query.domain === 'string' ? query.domain.trim().toLowerCase() : undefined;
    const allowedTenantSummaries = access.tenantIds.length
      ? await this.tenantManagementService.getTenantSummariesByIds(access.tenantIds)
      : [];
    const domainToTenant = new Map(allowedTenantSummaries.map((item) => [item.domain, item.id]));

    let effectiveDomain = queryDomain ?? undefined;
    let effectiveTenantId: string | undefined = undefined;

    if (access.isSuperAdmin) {
      effectiveTenantId = query.tenantId?.trim() || queryDomain ? domainToTenant.get(queryDomain ?? '') : undefined;
    } else {
      if (effectiveDomain) {
        if (!domainToTenant.has(effectiveDomain)) {
          effectiveDomain = allowedTenantSummaries.length > 0 ? allowedTenantSummaries[0].domain : undefined;
        }
      } else if (allowedTenantSummaries.length > 0) {
        effectiveDomain = allowedTenantSummaries[0].domain;
      }
      if (!effectiveDomain) {
        throw new ForbiddenException('Không có quyền truy cập dữ liệu đăng ký');
      }
      effectiveTenantId = domainToTenant.get(effectiveDomain);
    }

    const extensionIds = access.allowedExtensionIds ? Array.from(new Set(access.allowedExtensionIds)) : undefined;

    return this.fsManagementService.getSofiaRegistrations(params.profile, {
      tenantId: access.isSuperAdmin ? query.tenantId ?? effectiveTenantId : effectiveTenantId,
      status: query.status,
      search: query.search,
      domain: effectiveDomain ?? query.domain,
      extensionIds,
      isSuperAdmin: access.isSuperAdmin,
    });
  }

  @Get('channels')
  @UseGuards(JwtAuthGuard)
  async channels(@Req() req: Request & { user?: any }) {
    const authUser = req.user;
    if (!authUser) {
      throw new ForbiddenException('Phiên đăng nhập không hợp lệ');
    }
    const access = await this.portalUsersService.resolveRealtimeAccess(authUser.id || authUser.sub);
    const allowedPermissions = this.extractAllowedPermissions(authUser);
    if (!access.isSuperAdmin && !allowedPermissions.has('view_calls')) {
      throw new ForbiddenException('Không có quyền truy cập dữ liệu cuộc gọi');
    }
    return this.fsManagementService.getChannels();
  }

  @Post('channels/:uuid/hangup')
  @HttpCode(HttpStatus.ACCEPTED)
  async hangup(@Param() params: ChannelUuidParamDto) {
    await this.fsManagementService.hangupCall(params.uuid);
    return { success: true };
  }

  private extractAllowedPermissions(user: any): Set<string> {
    const permissions = new Set<string>();
    if (Array.isArray(user?.permissions)) {
      for (const perm of user.permissions) {
        if (typeof perm === 'string' && perm.trim()) {
          permissions.add(perm.trim());
        }
      }
    }
    if (Array.isArray(user?.rolePermissions)) {
      for (const perm of user.rolePermissions) {
        if (typeof perm === 'string' && perm.trim()) {
          permissions.add(perm.trim());
        }
      }
    }
    return permissions;
  }
}
