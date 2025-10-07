import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiPropertyOptional({ description: 'ID tenant tuỳ chọn' })
  id?: string;

  @ApiProperty({ description: 'Tên tenant', example: 'Acme Corp' })
  name!: string;

  @ApiProperty({ description: 'Domain SIP của tenant', example: 'acme.local' })
  domain!: string;

  @ApiPropertyOptional({ description: 'Tiền tố quay nội bộ', example: '9' })
  internalPrefix?: string;

  @ApiPropertyOptional({ description: 'Tiền tố voicemail', example: '*9' })
  voicemailPrefix?: string;

  @ApiPropertyOptional({ description: 'Gateway PSTN mặc định', example: 'pstn' })
  pstnGateway?: string;

  @ApiPropertyOptional({ description: 'Bật chuẩn hoá E164', default: true })
  enableE164?: boolean;

  @ApiPropertyOptional({ description: 'Danh sách codec ưu tiên', example: 'PCMU,PCMA,G722' })
  codecString?: string;

  @ApiPropertyOptional({
    description: 'Giới hạn số extension cho tenant (để trống nghĩa là không giới hạn)',
    example: 50,
    nullable: true,
  })
  extensionLimit?: number | null;
}
