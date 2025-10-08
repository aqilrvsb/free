import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsPositive, IsString, MaxLength } from 'class-validator';

export class TopupBillingDto {
  @ApiProperty({ description: 'Tenant cần nạp quỹ', example: 'tenant1' })
  @IsString()
  @MaxLength(64)
  tenantId!: string;

  @ApiProperty({ description: 'Số tiền nạp', example: 50000 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ description: 'Ghi chú nạp quỹ', required: false })
  @IsString()
  @MaxLength(255)
  note?: string;
}
