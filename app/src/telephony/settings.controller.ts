import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  RecordingStorageConfigDto,
  SettingsService,
  FsPortConfigDto,
  FsPortConfigUpdateResult,
} from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('recordings-storage')
  async getRecordingStorage() {
    return this.settingsService.getRecordingStorageConfig();
  }

  @Put('recordings-storage')
  async updateRecordingStorage(@Body() body: RecordingStorageConfigDto) {
    return this.settingsService.updateRecordingStorageConfig(body);
  }

  @Get('fs-ports')
  async getFsPorts(): Promise<FsPortConfigDto> {
    return this.settingsService.getFsPortConfig();
  }

  @Put('fs-ports')
  async updateFsPorts(@Body() body: Partial<FsPortConfigDto>): Promise<FsPortConfigUpdateResult> {
    return this.settingsService.updateFsPortConfig(body);
  }
}
