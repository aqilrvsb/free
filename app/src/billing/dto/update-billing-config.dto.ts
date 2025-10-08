import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsNumber, IsOptional, IsPositive, IsString, MaxLength, Min } from 'class-validator';

export class UpdateBillingConfigDto {
  @ApiPropertyOptional({ description: 'Đơn vị tiền tệ', example: 'VND' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ description: 'Đơn giá mặc định mỗi phút', example: 150.0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultRatePerMinute?: number;

  @ApiPropertyOptional({ description: 'Bước tính cước mặc định (giây)', example: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  defaultIncrementSeconds?: number;

  @ApiPropertyOptional({ description: 'Phí thiết lập cuộc gọi mặc định', example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultSetupFee?: number;

  @ApiPropertyOptional({ description: 'Thuế suất %', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxPercent?: number;

  @ApiPropertyOptional({ description: 'Email nhận báo cáo billing', nullable: true })
  @IsOptional()
  @IsEmail()
  billingEmail?: string | null;

  @ApiPropertyOptional({ description: 'Bật chế độ trừ quỹ prepaid', default: false })
  @IsOptional()
  @IsBoolean()
  prepaidEnabled?: boolean;
}
