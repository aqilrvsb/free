import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ExternalExtensionsService } from './extensions.service';
import { CreateExternalExtensionDto, ExternalExtensionResponseDto } from './dto';
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
  @ApiResponse({ status: 200, type: ExternalExtensionResponseDto })
  async getExtension(@Param('id') id: string): Promise<ExternalExtensionResponseDto> {
    return this.extensionsService.getExtension(id);
  }
}
