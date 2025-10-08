import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreateBillingChargeDto {
  @ApiProperty({ description: 'Tenant áp dụng phí phát sinh' })
  @IsString()
  @MaxLength(64)
  tenantId!: string;

  @ApiProperty({ description: 'Số tiền phí phát sinh', example: 5000 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ description: 'Mô tả phí phát sinh', required: false })
  @IsString()
  @MaxLength(255)
  description?: string;
}
