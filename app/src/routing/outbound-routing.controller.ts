import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { OutboundRoutingService, CreateOutboundRouteDto, UpdateOutboundRouteDto } from './outbound-routing.service';

@Controller('fs/outbound-routes')
export class OutboundRoutingController {
  constructor(private readonly outboundService: OutboundRoutingService) {}

  @Get()
  async listRoutes(@Query('tenantId') tenantId?: string) {
    return this.outboundService.listRoutes(tenantId?.trim() || undefined);
  }

  @Post()
  async createRoute(@Body() body: CreateOutboundRouteDto) {
    return this.outboundService.createRoute(body);
  }

  @Put(':id')
  async updateRoute(@Param('id') id: string, @Body() body: UpdateOutboundRouteDto) {
    return this.outboundService.updateRoute(id, body);
  }

  @Delete(':id')
  async deleteRoute(@Param('id') id: string) {
    await this.outboundService.deleteRoute(id);
    return { success: true };
  }
}
