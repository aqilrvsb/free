import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListOutboundCallerIdsQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo tenant', nullable: true })
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo gateway cụ thể', nullable: true })
  gatewayId?: string;

  @ApiPropertyOptional({ description: 'Chỉ lấy Caller ID đang active', default: true })
  active?: boolean;
}
