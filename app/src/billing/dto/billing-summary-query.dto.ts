import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';

export class BillingSummaryQueryDto {
  @ApiPropertyOptional({ description: 'Tenant cần thống kê', example: 'tenant1' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Ngày bắt đầu (ISO)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ description: 'Ngày kết thúc (ISO)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
