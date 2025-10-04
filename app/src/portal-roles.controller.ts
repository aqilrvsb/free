import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { PortalRolesService } from './portal-roles.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller()
export class PortalRolesController {
  constructor(private readonly rolesService: PortalRolesService) {}

  @Get('/portal-roles')
  async listRoles() {
    return this.rolesService.listRoles();
  }

  @Get('/portal-roles/:key')
  async getRole(@Param('key') key: string) {
    return this.rolesService.getRole(key);
  }

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

  @Delete('/portal-roles/:key')
  async deleteRole(@Param('key') key: string) {
    await this.rolesService.deleteRole(key);
    return { success: true };
  }
}
