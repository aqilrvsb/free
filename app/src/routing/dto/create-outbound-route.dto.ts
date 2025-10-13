import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BILLING_INCREMENT_MODES, type BillingIncrementMode } from '../../billing/billing.constants';

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

  @ApiPropertyOptional({ description: 'Bật billing cho route này', default: false })
  billingEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Tự động random Caller ID khi quay ra', default: false })
  randomizeCallerId?: boolean;

  @ApiPropertyOptional({ description: 'Đơn giá mỗi phút', example: 150.0 })
  billingRatePerMinute?: number;

  @ApiPropertyOptional({ description: 'Bước tính cước theo giây', example: 60 })
  billingIncrementSeconds?: number;

  @ApiPropertyOptional({
    description: 'Chế độ làm tròn thời lượng tính cước',
    enum: BILLING_INCREMENT_MODES,
    example: 'full_block',
  })
  billingIncrementMode?: BillingIncrementMode;

  @ApiPropertyOptional({ description: 'Phí thiết lập (nếu có)', example: 0 })
  billingSetupFee?: number;

  @ApiPropertyOptional({ description: 'CID hoặc mã khách hàng cho billing', nullable: true })
  billingCid?: string;
}
