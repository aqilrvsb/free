import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class TalktimeQueryDto {
  @ApiPropertyOptional({ description: 'Tenant ID cần lọc' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Agent group ID cần lọc' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ description: 'Ngày bắt đầu (ISO string)' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({ description: 'Ngày kết thúc (ISO string)' })
  @IsOptional()
  @IsISO8601()
  to?: string;
}
