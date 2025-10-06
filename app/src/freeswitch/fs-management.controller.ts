import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FsManagementService } from './fs-management.service';
import { SwaggerTags } from '../swagger/swagger-tags';

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
    @Param('profile') profile: string,
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.fsManagementService.getSofiaRegistrations(profile, { tenantId, status, search });
  }

  @Get('channels')
  async channels() {
    return this.fsManagementService.getChannels();
  }

  @Post('channels/:uuid/hangup')
  @HttpCode(HttpStatus.ACCEPTED)
  async hangup(@Param('uuid') uuid: string) {
    await this.fsManagementService.hangupCall(uuid);
    return { success: true };
  }
}
