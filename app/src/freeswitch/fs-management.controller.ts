import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FsManagementService } from './fs-management.service';
import { SwaggerTags } from '../swagger/swagger-tags';
import { ChannelUuidParamDto, SofiaProfileParamDto, SofiaRegistrationsQueryDto } from './dto';

@ApiTags(SwaggerTags.FreeSWITCH)
@Controller('fs')
export class FsManagementController {
  constructor(private readonly fsManagementService: FsManagementService) {}

  @Get('status')
  async status() {
    return this.fsManagementService.getCoreStatus();
  }

  @Get('sofia')
  async sofiaStatus() {
    return this.fsManagementService.getSofiaStatus();
  }

  @Get('sofia/:profile/registrations')
  async sofiaRegistrations(
    @Param() params: SofiaProfileParamDto,
    @Query() query: SofiaRegistrationsQueryDto,
  ) {
    return this.fsManagementService.getSofiaRegistrations(params.profile, {
      tenantId: query.tenantId,
      status: query.status,
      search: query.search,
      domain: query.domain,
    });
  }

  @Get('channels')
  async channels() {
    return this.fsManagementService.getChannels();
  }

  @Post('channels/:uuid/hangup')
  @HttpCode(HttpStatus.ACCEPTED)
  async hangup(@Param() params: ChannelUuidParamDto) {
    await this.fsManagementService.hangupCall(params.uuid);
    return { success: true };
  }
}
