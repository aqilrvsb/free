import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

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
}
