import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiBody, ApiParam, ApiTags } from '@nestjs/swagger';
import { GatewayManagementService, CreateGatewayDto, UpdateGatewayDto } from './gateway-management.service';
import { SwaggerTags } from '../swagger/swagger-tags';

@ApiTags(SwaggerTags.Telephony)
@Controller('fs/gateways')
export class GatewayManagementController {
  constructor(private readonly gatewayService: GatewayManagementService) {}

  @Get()
  async listGateways() {
    return this.gatewayService.listGateways();
  }

  @Post()
  @ApiBody({ description: 'Tạo gateway mới', type: Object })
  async createGateway(@Body() body: CreateGatewayDto) {
    return this.gatewayService.createGateway(body);
  }

  @Put(':id')
  @ApiParam({ name: 'id', description: 'ID gateway' })
  @ApiBody({ description: 'Cập nhật gateway', type: Object })
  async updateGateway(@Param('id') id: string, @Body() body: UpdateGatewayDto) {
    return this.gatewayService.updateGateway(id, body);
  }

  @Delete(':id')
  @ApiParam({ name: 'id', description: 'ID gateway' })
  async deleteGateway(@Param('id') id: string) {
    await this.gatewayService.deleteGateway(id);
    return { success: true };
  }
}
