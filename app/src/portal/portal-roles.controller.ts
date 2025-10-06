import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PortalRolesService } from './portal-roles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';
import { SwaggerTags } from '../swagger/swagger-tags';

interface AuthenticatedRequest extends Request {
  user?: {
    role?: string;
  };
}

@ApiTags(SwaggerTags.Portal)
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class PortalRolesController {
  constructor(private readonly rolesService: PortalRolesService) {}

  private isSuperAdmin(req?: AuthenticatedRequest): boolean {
    const rawRole = req?.user?.role || null;
    const role = rawRole === 'admin' ? 'super_admin' : rawRole;
    return role === 'super_admin';
  }

  @Roles('super_admin', 'tenant_admin')
  @Get('/portal-roles')
  async listRoles(@Req() req: AuthenticatedRequest) {
    const roles = await this.rolesService.listRoles();
    if (this.isSuperAdmin(req)) {
      return roles;
    }
    return roles.filter((role) => role.key !== 'super_admin');
  }

  @Roles('super_admin', 'tenant_admin')
  @Get('/portal-roles/:key')
  async getRole(@Param('key') key: string, @Req() req: AuthenticatedRequest) {
    if (!this.isSuperAdmin(req) && key === 'super_admin') {
      throw new ForbiddenException('Không có quyền xem role này');
    }
    return this.rolesService.getRole(key);
  }

  @Roles('super_admin')
  @Post('/portal-roles')
  async createRole(
    @Body()
    body: {
      key: string;
      name: string;
      description?: string;
      permissions?: string[];
    },
  ) {
    return this.rolesService.createRole({
      key: body.key,
      name: body.name,
      description: body.description,
      permissions: body.permissions || [],
    });
  }

  @Roles('super_admin')
  @Put('/portal-roles/:key')
  async updateRole(
    @Param('key') key: string,
    @Body()
    body: {
      name?: string;
      description?: string | null;
      permissions?: string[];
    },
  ) {
    return this.rolesService.updateRole(key, body);
  }

  @Roles('super_admin')
  @Delete('/portal-roles/:key')
  async deleteRole(@Param('key') key: string) {
    await this.rolesService.deleteRole(key);
    return { success: true };
  }
}
