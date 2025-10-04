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
  UseGuards,
} from '@nestjs/common';
import { PortalUsersService } from './portal-users.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller()
export class PortalUsersController {
  constructor(private readonly portalUsersService: PortalUsersService) {}

  @Get('/portal-users')
  async listPortalUsers(
    @Query('page', new DefaultValuePipe(0), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(0), ParseIntPipe) pageSize: number,
    @Query('search') search?: string,
  ) {
    if (page > 0 && pageSize > 0) {
      return this.portalUsersService.listUsersPaginated({ page, pageSize, search: search?.trim() });
    }
    return this.portalUsersService.listUsers({ search: search?.trim() });
  }

  @Get('/portal-users/:id')
  async getPortalUser(@Param('id') id: string) {
    return this.portalUsersService.getUser(id);
  }

  @Post('/portal-users')
  async createPortalUser(
    @Body()
    body: {
      email: string;
      password: string;
      displayName?: string;
      role?: 'admin' | 'viewer';
      isActive?: boolean;
    },
  ) {
    return this.portalUsersService.createUser(body);
  }

  @Put('/portal-users/:id')
  async updatePortalUser(
    @Param('id') id: string,
    @Body()
    body: {
      email?: string;
      displayName?: string | null;
      role?: 'admin' | 'viewer';
      isActive?: boolean;
    },
  ) {
    return this.portalUsersService.updateUser(id, body);
  }

  @Post('/portal-users/:id/reset-password')
  async resetPassword(
    @Param('id') id: string,
    @Body() body: { password: string },
  ) {
    return this.portalUsersService.resetPassword(id, body.password);
  }

  @Delete('/portal-users/:id')
  async deletePortalUser(@Param('id') id: string) {
    await this.portalUsersService.deleteUser(id);
    return { success: true };
  }
}
