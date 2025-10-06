import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InboundRoutingService } from './inbound-routing.service';
import { SwaggerTags } from '../swagger/swagger-tags';
import {
  CreateInboundRouteDto as CreateInboundRouteRequestDto,
  InboundRouteIdParamDto,
  TenantFilterQueryDto,
  UpdateInboundRouteDto as UpdateInboundRouteRequestDto,
} from './dto';

@ApiTags(SwaggerTags.Routing)
@Controller('fs/inbound-routes')
export class InboundRoutingController {
  constructor(private readonly inboundService: InboundRoutingService) {}

  @Get()
  async list(@Query() query: TenantFilterQueryDto) {
    return this.inboundService.listRoutes(query.tenantId?.trim() || undefined);
  }

  @Post()
  async create(@Body() body: CreateInboundRouteRequestDto) {
    return this.inboundService.createRoute(body);
  }

  @Put(':id')
  async update(@Param() params: InboundRouteIdParamDto, @Body() body: UpdateInboundRouteRequestDto) {
    return this.inboundService.updateRoute(params.id, body);
  }

  @Delete(':id')
  async remove(@Param() params: InboundRouteIdParamDto) {
    await this.inboundService.deleteRoute(params.id);
    return { success: true };
  }
}
