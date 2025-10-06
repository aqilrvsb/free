import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInboundRouteDto {
  @ApiProperty({ description: 'Tenant áp dụng route' })
  tenantId!: string;

  @ApiProperty({ description: 'Tên route' })
  name!: string;

  @ApiPropertyOptional({ description: 'Mô tả route', nullable: true })
  description?: string;

  @ApiProperty({ description: 'Số DID nhận cuộc gọi' })
  didNumber!: string;

  @ApiProperty({ description: 'Loại đích', enum: ['extension', 'sip_uri', 'ivr', 'voicemail'] })
  destinationType!: 'extension' | 'sip_uri' | 'ivr' | 'voicemail';

  @ApiProperty({ description: 'Giá trị đích (extension, URI, IVR ID, v.v.)' })
  destinationValue!: string;

  @ApiPropertyOptional({ description: 'Thứ tự ưu tiên', example: 0 })
  priority?: number;

  @ApiPropertyOptional({ description: 'Có bật route hay không', default: true })
  enabled?: boolean;
}
