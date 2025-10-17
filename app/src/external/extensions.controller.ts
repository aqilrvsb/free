import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ExternalExtensionsService } from './extensions.service';
import { CreateExternalExtensionDto, ExternalExtensionResponseDto, UpdateExternalExtensionDto } from './dto';
import { ExternalApiGuard } from './external-api.guard';
import { SwaggerTags } from '../swagger/swagger-tags';

@ApiTags(SwaggerTags.External)
@ApiHeader({
  name: 'X-API-Key',
  description: 'API token cấu hình qua EXTERNAL_EXTENSIONS_TOKEN (cho phép dùng Bearer token trong Authorization header)',
  required: true,
})
@UseGuards(ExternalApiGuard)
@Controller('external/extensions')
export class ExternalExtensionsController {
  constructor(private readonly extensionsService: ExternalExtensionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiResponse({ status: 201, type: ExternalExtensionResponseDto })
  async createExtension(@Body() body: CreateExternalExtensionDto): Promise<ExternalExtensionResponseDto> {
    return this.extensionsService.createExtension(body);
  }

  @Get(':id')
  @ApiQuery({
    name: 'tenantId',
    required: false,
    description: 'Tenant ID sở hữu extension (ưu tiên so với tenantDomain)',
  })
  @ApiQuery({
    name: 'tenantDomain',
    required: false,
    description: 'Domain của tenant (được dùng khi không truyền tenantId)',
  })
  @ApiResponse({ status: 200, type: ExternalExtensionResponseDto })
  async getExtension(
    @Param('id') id: string,
    @Query('tenantId') tenantId?: string,
    @Query('tenantDomain') tenantDomain?: string,
  ): Promise<ExternalExtensionResponseDto> {
    return this.extensionsService.getExtension(id, { tenantId, tenantDomain });
  }

  @Put(':id')
  @ApiQuery({
    name: 'tenantId',
    required: false,
    description: 'Tenant ID sở hữu extension (ưu tiên so với tenantDomain)',
  })
  @ApiQuery({
    name: 'tenantDomain',
    required: false,
    description: 'Domain của tenant (được dùng khi không truyền tenantId)',
  })
  @ApiResponse({ status: 200, type: ExternalExtensionResponseDto })
  async updateExtension(
    @Param('id') id: string,
    @Body() body: UpdateExternalExtensionDto,
    @Query('tenantId') tenantId?: string,
    @Query('tenantDomain') tenantDomain?: string,
  ): Promise<ExternalExtensionResponseDto> {
    return this.extensionsService.updateExtension(id, body, { tenantId, tenantDomain });
  }

  @Delete(':id')
  @ApiQuery({
    name: 'tenantId',
    required: false,
    description: 'Tenant ID sở hữu extension (ưu tiên so với tenantDomain)',
  })
  @ApiQuery({
    name: 'tenantDomain',
    required: false,
    description: 'Domain của tenant (được dùng khi không truyền tenantId)',
  })
  @ApiResponse({ status: 200, schema: { properties: { success: { type: 'boolean', example: true } } } })
  async deleteExtension(
    @Param('id') id: string,
    @Query('tenantId') tenantId?: string,
    @Query('tenantDomain') tenantDomain?: string,
  ): Promise<{ success: true }> {
    return this.extensionsService.deleteExtension(id, { tenantId, tenantDomain });
  }
}
