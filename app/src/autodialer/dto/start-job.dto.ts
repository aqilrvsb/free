import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class StartJobDto {
  @ApiPropertyOptional({ description: 'Gateway hoặc endpoint override', example: 'pstn' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  gateway?: string;

  @ApiPropertyOptional({ description: 'Caller ID hiển thị khi quay số' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  callerIdNumber?: string;

  @ApiPropertyOptional({ description: 'Sử dụng pool Caller ID khi gọi ra', default: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true' || value === 1 || value === '1')
  useCallerIdPool?: boolean;
}
