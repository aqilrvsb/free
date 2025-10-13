import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateOutboundCallerIdDto {
  @ApiPropertyOptional({ description: 'Tenant sở hữu Caller ID', nullable: true })
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Số Caller ID dùng để gọi ra', nullable: true })
  callerIdNumber?: string;

  @ApiPropertyOptional({ description: 'Tên hiển thị Caller ID', nullable: true })
  callerIdName?: string | null;

  @ApiPropertyOptional({ description: 'ID gateway áp dụng (để null nếu dùng chung)', nullable: true })
  gatewayId?: string | null;

  @ApiPropertyOptional({ description: 'Nhãn mô tả nội bộ', nullable: true })
  label?: string | null;

  @ApiPropertyOptional({ description: 'Trọng số khi random', nullable: true })
  weight?: number;

  @ApiPropertyOptional({ description: 'Bật/tắt Caller ID', nullable: true })
  active?: boolean;
}
