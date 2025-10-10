import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class UpdateAutoDialerCampaignDto {
  @ApiPropertyOptional({ description: 'Tên chiến dịch' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Mô tả' })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ description: 'Trạng thái chiến dịch', enum: ['draft', 'running', 'paused', 'completed', 'archived'] })
  @IsOptional()
  @IsIn(['draft', 'running', 'paused', 'completed', 'archived'])
  status?: 'draft' | 'running' | 'paused' | 'completed' | 'archived';

  @ApiPropertyOptional({ description: 'Chế độ quay số', enum: ['ivr', 'playback'] })
  @IsOptional()
  @IsIn(['ivr', 'playback'])
  dialMode?: 'ivr' | 'playback';

  @ApiPropertyOptional({ description: 'IVR menu ID (nếu dùng IVR)' })
  @ValidateIf((dto) => dto.dialMode === 'ivr')
  @IsUUID()
  ivrMenuId?: string | null;

  @ApiPropertyOptional({ description: 'URL audio playback' })
  @ValidateIf((dto) => (dto.dialMode ?? 'playback') === 'playback')
  @IsOptional()
  @IsString()
  audioUrl?: string | null;

  @ApiPropertyOptional({ description: 'Giới hạn cuộc gọi đồng thời' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  maxConcurrentCalls?: number;

  @ApiPropertyOptional({ description: 'Số lần retry tối đa' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @ApiPropertyOptional({ description: 'Delay giữa các lần retry (giây)' })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86_400)
  retryDelaySeconds?: number;

  @ApiPropertyOptional({ description: 'Khung giờ bắt đầu (HH:mm)' })
  @IsOptional()
  @Matches(TIME_REGEX)
  callWindowStart?: string | null;

  @ApiPropertyOptional({ description: 'Khung giờ kết thúc (HH:mm)' })
  @IsOptional()
  @Matches(TIME_REGEX)
  callWindowEnd?: string | null;

  @ApiPropertyOptional({ description: 'Cho phép gọi cuối tuần' })
  @IsOptional()
  @IsBoolean()
  allowWeekends?: boolean;

  @ApiPropertyOptional({ description: 'Metadata bổ sung (JSON)' })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
