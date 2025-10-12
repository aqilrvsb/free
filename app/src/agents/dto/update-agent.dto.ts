import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';

export class UpdateAgentDto {
  @ApiPropertyOptional({ description: 'Tên hiển thị của agent' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  displayName?: string | null;

  @ApiPropertyOptional({ description: 'Extension gán cho agent', nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 32)
  extensionId?: string | null;

  @ApiPropertyOptional({ description: 'Nhóm quản lý', nullable: true })
  @IsOptional()
  @IsUUID()
  groupId?: string | null;

  @ApiPropertyOptional({ description: 'Portal user gắn với agent', nullable: true })
  @IsOptional()
  @IsUUID()
  portalUserId?: string | null;

  @ApiPropertyOptional({ description: 'Agent cấp trên', nullable: true })
  @IsOptional()
  @IsUUID()
  parentAgentId?: string | null;

  @ApiPropertyOptional({ description: 'Bật KPI talktime' })
  @IsOptional()
  @IsBoolean()
  kpiTalktimeEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Mục tiêu talktime (giây)', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  kpiTalktimeTargetSeconds?: number | null;
}
