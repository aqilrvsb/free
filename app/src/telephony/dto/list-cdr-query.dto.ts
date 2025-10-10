import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListCdrQueryDto {
  @ApiPropertyOptional({ type: Number, description: 'Trang (>=1)' })
  page?: string;

  @ApiPropertyOptional({ type: Number, description: 'Số bản ghi mỗi trang' })
  pageSize?: string;

  @ApiPropertyOptional({ description: 'Tenant ID cần lọc' })
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Chiều cuộc gọi (inbound/outbound)' })
  direction?: string;

  @ApiPropertyOptional({ description: 'UUID cuộc gọi' })
  callUuid?: string;

  @ApiPropertyOptional({ description: 'Số gọi đi (extension/máy gọi)' })
  fromNumber?: string;

  @ApiPropertyOptional({ description: 'Số bị gọi' })
  toNumber?: string;

  @ApiPropertyOptional({ description: 'Trạng thái cuộc gọi (answered/busy/cancelled/no_answer/failed/unknown)' })
  status?: string;

  @ApiPropertyOptional({ description: 'Ngày bắt đầu (ISO string)' })
  from?: string;

  @ApiPropertyOptional({ description: 'Ngày kết thúc (ISO string)' })
  to?: string;
}
