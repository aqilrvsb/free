import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class IvrMenuOptionDto {
  @ApiProperty({ description: 'Phím nhấn', example: '1' })
  digit!: string;

  @ApiPropertyOptional({ description: 'Mô tả phím', nullable: true })
  description?: string;

  @ApiProperty({ description: 'Hành động', enum: ['extension', 'sip_uri', 'voicemail', 'hangup'] })
  actionType!: 'extension' | 'sip_uri' | 'voicemail' | 'hangup';

  @ApiPropertyOptional({ description: 'Giá trị hành động', nullable: true })
  actionValue?: string | null;

  @ApiPropertyOptional({ description: 'Thứ tự hiển thị', example: 0 })
  position?: number;
}

export class CreateIvrMenuDto {
  @ApiProperty({ description: 'Tenant áp dụng IVR' })
  tenantId!: string;

  @ApiProperty({ description: 'Tên menu' })
  name!: string;

  @ApiPropertyOptional({ description: 'Mô tả menu', nullable: true })
  description?: string;

  @ApiPropertyOptional({ description: 'Audio greeting', nullable: true })
  greetingAudioUrl?: string;

  @ApiPropertyOptional({ description: 'Audio khi chọn phím không hợp lệ', nullable: true })
  invalidAudioUrl?: string;

  @ApiPropertyOptional({ description: 'Timeout chờ phím', example: 5 })
  timeoutSeconds?: number;

  @ApiPropertyOptional({ description: 'Số lần retry', example: 3 })
  maxRetries?: number;

  @ApiProperty({ type: [IvrMenuOptionDto], description: 'Danh sách tuỳ chọn' })
  options!: IvrMenuOptionDto[];
}
