import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IvrMenuService, CreateIvrMenuDto, UpdateIvrMenuDto } from './ivr-menu.service';
import { SwaggerTags } from '../swagger/swagger-tags';

@ApiTags(SwaggerTags.IVR)
@Controller('fs/ivr-menus')
export class IvrMenuController {
  constructor(private readonly ivrService: IvrMenuService) {}

  @Get()
  async list(@Query('tenantId') tenantId?: string) {
    return this.ivrService.listMenus(tenantId?.trim() || undefined);
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    return this.ivrService.getMenu(id);
  }

  @Post()
  async create(@Body() body: CreateIvrMenuDto) {
    return this.ivrService.createMenu(body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateIvrMenuDto) {
    return this.ivrService.updateMenu(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.ivrService.deleteMenu(id);
    return { success: true };
  }
}
