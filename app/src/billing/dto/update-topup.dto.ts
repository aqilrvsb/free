import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class UpdateTopupDto {
  @ApiPropertyOptional({ description: 'Số tiền mới cho lần nạp quỹ gần nhất', example: 50000 })
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  amount?: number;

  @ApiPropertyOptional({ description: 'Ghi chú mới', maxLength: 255, nullable: true, example: 'Điều chỉnh thủ công' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string | null;
}
