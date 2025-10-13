import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOutboundCallerIdDto {
  @ApiProperty({ description: 'Tenant sở hữu Caller ID' })
  tenantId!: string;

  @ApiProperty({ description: 'Số Caller ID dùng để gọi ra', example: '0987654321' })
  callerIdNumber!: string;

  @ApiPropertyOptional({ description: 'Tên hiển thị Caller ID', nullable: true, example: 'Support Team' })
  callerIdName?: string | null;

  @ApiPropertyOptional({ description: 'ID gateway áp dụng (để null nếu dùng chung)', nullable: true })
  gatewayId?: string | null;

  @ApiPropertyOptional({ description: 'Nhãn mô tả nội bộ', nullable: true })
  label?: string | null;

  @ApiPropertyOptional({ description: 'Trọng số khi random', default: 1 })
  weight?: number;

  @ApiPropertyOptional({ description: 'Bật/tắt Caller ID', default: true })
  active?: boolean;
}
