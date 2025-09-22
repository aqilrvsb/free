import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { GatewayManagementService, CreateGatewayDto, UpdateGatewayDto } from './gateway-management.service';

@Controller('fs/gateways')
export class GatewayManagementController {
  constructor(private readonly gatewayService: GatewayManagementService) {}

  @Get()
  async listGateways() {
    return this.gatewayService.listGateways();
  }

  @Post()
  async createGateway(@Body() body: CreateGatewayDto) {
    return this.gatewayService.createGateway(body);
  }

  @Put(':id')
  async updateGateway(@Param('id') id: string, @Body() body: UpdateGatewayDto) {
    return this.gatewayService.updateGateway(id, body);
  }

  @Delete(':id')
  async deleteGateway(@Param('id') id: string) {
    await this.gatewayService.deleteGateway(id);
    return { success: true };
  }
}
