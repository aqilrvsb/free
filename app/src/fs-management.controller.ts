import { Controller, Get, Param, Query } from '@nestjs/common';
import { FsManagementService } from './fs-management.service';

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
  async sofiaRegistrations(@Param('profile') profile: string) {
    return this.fsManagementService.getSofiaRegistrations(profile);
  }

  @Get('channels')
  async channels() {
    return this.fsManagementService.getChannels();
  }
}
