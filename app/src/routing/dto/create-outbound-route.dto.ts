import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOutboundRouteDto {
  @ApiProperty({ description: 'Tenant áp dụng route' })
  tenantId!: string;

  @ApiProperty({ description: 'Tên route' })
  name!: string;

  @ApiPropertyOptional({ description: 'Mô tả route', nullable: true })
  description?: string;

  @ApiPropertyOptional({ description: 'Tiền tố cần match', default: '' })
  matchPrefix?: string;

  @ApiPropertyOptional({ description: 'ID gateway sử dụng', nullable: true })
  gatewayId?: string | null;

  @ApiPropertyOptional({ description: 'Thứ tự ưu tiên', example: 0 })
  priority?: number;

  @ApiPropertyOptional({ description: 'Số chữ số cần cắt', example: 0 })
  stripDigits?: number;

  @ApiPropertyOptional({ description: 'Chuỗi thêm vào trước số quay', default: '' })
  prepend?: string;

  @ApiPropertyOptional({ description: 'Có bật route hay không', default: true })
  enabled?: boolean;
}
