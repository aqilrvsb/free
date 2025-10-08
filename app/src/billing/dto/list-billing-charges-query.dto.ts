import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, IsNumber, Min } from 'class-validator';

export class ListBillingChargesQueryDto {
  @ApiProperty({ description: 'Tenant cần xem phí phát sinh' })
  @IsString()
  @MaxLength(64)
  tenantId!: string;

  @ApiPropertyOptional({ description: 'Giới hạn số bản ghi trả về', example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;
}
