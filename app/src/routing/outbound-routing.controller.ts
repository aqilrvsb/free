import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OutboundRoutingService } from './outbound-routing.service';
import { SwaggerTags } from '../swagger/swagger-tags';
import {
  CreateOutboundRouteDto as CreateOutboundRouteRequestDto,
  OutboundRouteIdParamDto,
  TenantFilterQueryDto,
  UpdateOutboundRouteDto as UpdateOutboundRouteRequestDto,
} from './dto';

@ApiTags(SwaggerTags.Routing)
@Controller('fs/outbound-routes')
export class OutboundRoutingController {
  constructor(private readonly outboundService: OutboundRoutingService) {}

  @Get()
  async listRoutes(@Query() query: TenantFilterQueryDto) {
    return this.outboundService.listRoutes(query.tenantId?.trim() || undefined);
  }

  @Post()
  async createRoute(@Body() body: CreateOutboundRouteRequestDto) {
    return this.outboundService.createRoute(body);
  }

  @Put(':id')
  async updateRoute(@Param() params: OutboundRouteIdParamDto, @Body() body: UpdateOutboundRouteRequestDto) {
    return this.outboundService.updateRoute(params.id, body);
  }

  @Delete(':id')
  async deleteRoute(@Param() params: OutboundRouteIdParamDto) {
    await this.outboundService.deleteRoute(params.id);
    return { success: true };
  }
}
