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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PortalUsersService } from './portal-users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { Request } from 'express';
import { SwaggerTags } from '../swagger/swagger-tags';

interface AuthenticatedRequest extends Request {
  user?: {
    role?: string;
    tenantIds?: string[];
  };
}

@ApiTags(SwaggerTags.Portal)
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'tenant_admin')
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
    };
  }

  @Get('/portal-users')
  async listPortalUsers(
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(0), ParseIntPipe) pageSize: number,
    @Query('search') search?: string,
    @Req() req?: AuthenticatedRequest,
  ) {
    const scope = this.resolveScope(req);
    if (page > 0 && pageSize > 0) {
      return this.portalUsersService.listUsersPaginated({ page, pageSize, search: search?.trim() }, scope);
    }
    return this.portalUsersService.listUsers({ search: search?.trim() }, scope);
  }

  @Get('/portal-users/:id')
  async getPortalUser(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.portalUsersService.getUser(id, this.resolveScope(req));
  }

  @Post('/portal-users')
  async createPortalUser(
    @Body()
    body: {
      email: string;
      password: string;
      displayName?: string;
      role?: string;
      isActive?: boolean;
      permissions?: string[];
      tenantIds?: string[];
    },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.portalUsersService.createUser(body, this.resolveScope(req));
  }

  @Put('/portal-users/:id')
  async updatePortalUser(
    @Param('id') id: string,
    @Body()
    body: {
      email?: string;
      displayName?: string | null;
      role?: string;
      isActive?: boolean;
      permissions?: string[];
      tenantIds?: string[] | null;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.portalUsersService.updateUser(id, body, this.resolveScope(req));
  }

  @Post('/portal-users/:id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body() body: { password: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.portalUsersService.resetPassword(id, body.password, this.resolveScope(req));
  }

  @Delete('/portal-users/:id')
  async deletePortalUser(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    await this.portalUsersService.deleteUser(id, this.resolveScope(req));
    return { success: true };
  }
}
