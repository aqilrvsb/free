import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { InboundRoutingService, CreateInboundRouteDto, UpdateInboundRouteDto } from './inbound-routing.service';

@Controller('fs/inbound-routes')
export class InboundRoutingController {
  constructor(private readonly inboundService: InboundRoutingService) {}

  @Get()
  async list(@Query('tenantId') tenantId?: string) {
    return this.inboundService.listRoutes(tenantId?.trim() || undefined);
  }

  @Post()
  async create(@Body() body: CreateInboundRouteDto) {
    return this.inboundService.createRoute(body);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: UpdateInboundRouteDto) {
    return this.inboundService.updateRoute(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.inboundService.deleteRoute(id);
    return { success: true };
  }
}
