import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CreateAutoDialerCampaignDto {
  @ApiProperty({ description: 'Tenant ID sở hữu chiến dịch' })
  @IsNotEmpty()
  @IsString()
  tenantId!: string;

  @ApiProperty({ description: 'Tên chiến dịch' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ description: 'Mô tả chi tiết' })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional({ description: 'Chế độ quay số', enum: ['ivr', 'playback'], default: 'playback' })
  @IsOptional()
  @IsIn(['ivr', 'playback'])
  dialMode?: 'ivr' | 'playback';

  @ApiPropertyOptional({ description: 'ID IVR menu áp dụng (nếu dialMode=ivr)' })
  @ValidateIf((dto) => dto.dialMode === 'ivr')
  @IsUUID()
  ivrMenuId?: string;

  @ApiPropertyOptional({ description: 'URL file âm thanh phát khi dialMode=playback' })
  @ValidateIf((dto) => (dto.dialMode ?? 'playback') === 'playback')
  @IsOptional()
  @IsString()
  audioUrl?: string | null;

  @ApiPropertyOptional({ description: 'Số cuộc gọi đồng thời tối đa', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  maxConcurrentCalls?: number;

  @ApiPropertyOptional({ description: 'Số lần gọi lại tối đa', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @ApiPropertyOptional({ description: 'Thời gian chờ giữa các lần gọi lại (giây)', default: 300 })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86_400)
  retryDelaySeconds?: number;

  @ApiPropertyOptional({ description: 'Khung giờ bắt đầu gọi (HH:mm)' })
  @IsOptional()
  @Matches(TIME_REGEX)
  callWindowStart?: string | null;

  @ApiPropertyOptional({ description: 'Khung giờ kết thúc gọi (HH:mm)' })
  @IsOptional()
  @Matches(TIME_REGEX)
  callWindowEnd?: string | null;

  @ApiPropertyOptional({ description: 'Cho phép gọi cuối tuần', default: true })
  @IsOptional()
  @IsBoolean()
  allowWeekends?: boolean;

  @ApiPropertyOptional({ description: 'Metadata bổ sung (JSON)' })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
