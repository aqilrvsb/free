import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';

export class CreateAgentDto {
  @ApiProperty({ description: 'Tenant ID của agent' })
  @IsString()
  @Length(1, 64)
  tenantId!: string;

  @ApiProperty({ description: 'Tên hiển thị của agent' })
  @IsString()
  @Length(1, 255)
  displayName!: string;

  @ApiPropertyOptional({ description: 'Extension được gán cho agent' })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  extensionId?: string;

  @ApiPropertyOptional({ description: 'Nhóm quản lý của agent' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ description: 'Portal user gắn với agent', nullable: true })
  @IsOptional()
  @IsUUID()
  portalUserId?: string;

  @ApiPropertyOptional({ description: 'Agent cấp trên', nullable: true })
  @IsOptional()
  @IsUUID()
  parentAgentId?: string;

  @ApiPropertyOptional({ description: 'Bật KPI theo talktime' })
  @IsOptional()
  @IsBoolean()
  kpiTalktimeEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Mục tiêu talktime (giây)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  kpiTalktimeTargetSeconds?: number;
}
