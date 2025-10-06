import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IvrMenuService } from './ivr-menu.service';
import { SwaggerTags } from '../swagger/swagger-tags';
import {
  CreateIvrMenuDto as CreateIvrMenuRequestDto,
  IvrMenuIdParamDto,
  ListIvrMenuQueryDto,
  UpdateIvrMenuDto as UpdateIvrMenuRequestDto,
} from './dto';

@ApiTags(SwaggerTags.IVR)
@Controller('fs/ivr-menus')
export class IvrMenuController {
  constructor(private readonly ivrService: IvrMenuService) {}

  @Get()
  async list(@Query() query: ListIvrMenuQueryDto) {
    return this.ivrService.listMenus(query.tenantId?.trim() || undefined);
  }

  @Get(':id')
  async detail(@Param() params: IvrMenuIdParamDto) {
    return this.ivrService.getMenu(params.id);
  }

  @Post()
  async create(@Body() body: CreateIvrMenuRequestDto) {
    return this.ivrService.createMenu(body);
  }

  @Put(':id')
  async update(@Param() params: IvrMenuIdParamDto, @Body() body: UpdateIvrMenuRequestDto) {
    return this.ivrService.updateMenu(params.id, body);
  }

  @Delete(':id')
  async remove(@Param() params: IvrMenuIdParamDto) {
    await this.ivrService.deleteMenu(params.id);
    return { success: true };
  }
}
