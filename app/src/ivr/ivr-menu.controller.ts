import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IvrMenuService } from './ivr-menu.service';
import { SwaggerTags } from '../swagger/swagger-tags';
import {
  CreateIvrMenuDto as CreateIvrMenuRequestDto,
  IvrMenuIdParamDto,
  ListIvrMenuQueryDto,
  UpdateIvrMenuDto as UpdateIvrMenuRequestDto,
} from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import type { Request } from 'express';

@ApiTags(SwaggerTags.IVR)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'tenant_admin', 'operator')
@Controller('fs/ivr-menus')
export class IvrMenuController {
  constructor(private readonly ivrService: IvrMenuService) {}

  private resolveScope(req?: Request) {
    const rawRole = (req as any)?.user?.role ?? null;
    const role = rawRole === 'admin' ? 'super_admin' : rawRole;
    const tenantIds = Array.isArray((req as any)?.user?.tenantIds) ? (req as any).user.tenantIds : [];
    return {
      isSuperAdmin: role === 'super_admin',
      tenantIds,
    };
  }

  @Get()
  async list(@Query() query: ListIvrMenuQueryDto, @Req() req: Request) {
    return this.ivrService.listMenus(query.tenantId?.trim() || undefined, this.resolveScope(req));
  }

  @Get(':id')
  async detail(@Param() params: IvrMenuIdParamDto, @Req() req: Request) {
    return this.ivrService.getMenu(params.id, this.resolveScope(req));
  }

  @Post()
  async create(@Body() body: CreateIvrMenuRequestDto, @Req() req: Request) {
    return this.ivrService.createMenu(body, this.resolveScope(req));
  }

  @Put(':id')
  async update(
    @Param() params: IvrMenuIdParamDto,
    @Body() body: UpdateIvrMenuRequestDto,
    @Req() req: Request,
  ) {
    return this.ivrService.updateMenu(params.id, body, this.resolveScope(req));
  }

  @Delete(':id')
  async remove(@Param() params: IvrMenuIdParamDto, @Req() req: Request) {
    await this.ivrService.deleteMenu(params.id, this.resolveScope(req));
    return { success: true };
  }
}
