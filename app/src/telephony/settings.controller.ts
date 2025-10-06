import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import {
  RecordingStorageConfigDto,
  SettingsService,
  FsPortConfigDto,
  FsPortConfigUpdateResult,
} from './settings.service';
import { SwaggerTags } from '../swagger/swagger-tags';

@ApiTags(SwaggerTags.Telephony)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('recordings-storage')
  async getRecordingStorage() {
    return this.settingsService.getRecordingStorageConfig();
  }

  @Put('recordings-storage')
  @ApiBody({ description: 'Cấu hình lưu trữ ghi âm', type: Object })
  async updateRecordingStorage(@Body() body: RecordingStorageConfigDto) {
    return this.settingsService.updateRecordingStorageConfig(body);
  }

  @Get('fs-ports')
  async getFsPorts(): Promise<FsPortConfigDto> {
    return this.settingsService.getFsPortConfig();
  }

  @Put('fs-ports')
  @ApiBody({ description: 'Cập nhật cấu hình port FreeSWITCH', type: Object })
  async updateFsPorts(@Body() body: Partial<FsPortConfigDto>): Promise<FsPortConfigUpdateResult> {
    return this.settingsService.updateFsPortConfig(body);
  }
}
