import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PortalUsersService } from './portal-users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { Request } from 'express';
import { SwaggerTags } from '../swagger/swagger-tags';
import {
  CreatePortalUserDto,
  ListPortalUsersQueryDto,
  PortalUserIdParamDto,
  ResetPortalUserPasswordDto,
  UpdatePortalUserDto,
} from './dto';

interface AuthenticatedRequest extends Request {
  user?: {
    role?: string;
    tenantIds?: string[];
    agentId?: string | null;
  };
}

@ApiTags(SwaggerTags.Portal)
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'tenant_admin', 'agent_lead')
@Controller()
export class PortalUsersController {
  constructor(private readonly portalUsersService: PortalUsersService) {}

  private resolveScope(req?: AuthenticatedRequest) {
    const rawRole = req?.user?.role || null;
    const role = rawRole === 'admin' ? 'super_admin' : rawRole;
    const tenantIds = Array.isArray(req?.user?.tenantIds) ? req!.user!.tenantIds : [];
    return {
      isSuperAdmin: role === 'super_admin',
      tenantIds,
      role,
      agentId: req?.user?.agentId ?? null,
      isAgentLead: role === 'agent_lead',
    };
  }

  @Get('/portal-users')
  async listPortalUsers(@Query() query: ListPortalUsersQueryDto, @Req() req?: AuthenticatedRequest) {
    const pageRaw = Number(query.page ?? 0);
    const pageSizeRaw = Number(query.pageSize ?? 0);
    const page = Number.isFinite(pageRaw) ? pageRaw : 0;
    const pageSize = Number.isFinite(pageSizeRaw) ? pageSizeRaw : 0;
    const search = query.search?.trim();
    const tenantId = query.tenantId?.trim() || undefined;
    const role = query.role?.trim().toLowerCase() || undefined;
    const scope = this.resolveScope(req);
    if (page > 0 && pageSize > 0) {
      return this.portalUsersService.listUsersPaginated({ page, pageSize, search, tenantId, role }, scope);
    }
    return this.portalUsersService.listUsers({ search, tenantId, role }, scope);
  }

  @Get('/portal-users/:id')
  async getPortalUser(@Param() params: PortalUserIdParamDto, @Req() req: AuthenticatedRequest) {
    return this.portalUsersService.getUser(params.id, this.resolveScope(req));
  }

  @Post('/portal-users')
  async createPortalUser(@Body() body: CreatePortalUserDto, @Req() req: AuthenticatedRequest) {
    return this.portalUsersService.createUser(body, this.resolveScope(req));
  }

  @Put('/portal-users/:id')
  async updatePortalUser(
    @Param() params: PortalUserIdParamDto,
    @Body() body: UpdatePortalUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.portalUsersService.updateUser(params.id, body, this.resolveScope(req));
  }

  @Post('/portal-users/:id/reset-password')
  async resetPassword(
    @Param() params: PortalUserIdParamDto,
    @Body() body: ResetPortalUserPasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.portalUsersService.resetPassword(params.id, body.password, this.resolveScope(req));
  }

  @Delete('/portal-users/:id')
  async deletePortalUser(@Param() params: PortalUserIdParamDto, @Req() req: AuthenticatedRequest) {
    await this.portalUsersService.deleteUser(params.id, this.resolveScope(req));
    return { success: true };
  }
}
