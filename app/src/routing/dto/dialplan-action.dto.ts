import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DialplanActionDto {
  @ApiPropertyOptional({ description: 'ID action (dành cho cập nhật)' })
  id?: string;

  @ApiPropertyOptional({ description: 'Thứ tự thực thi', example: 0 })
  position?: number;

  @ApiProperty({ description: 'Tên application', example: 'bridge' })
  application!: string;

  @ApiPropertyOptional({ description: 'Dữ liệu cho application', nullable: true })
  data?: string | null;
}
