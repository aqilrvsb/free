import { ApiProperty } from '@nestjs/swagger';

export class ExternalExtensionResponseDto {
  @ApiProperty({ description: 'Mã extension', example: '1001' })
  id!: string;

  @ApiProperty({ description: 'ID tenant', example: 'tenant1' })
  tenantId!: string;

  @ApiProperty({ description: 'Tên hiển thị', example: 'Agent 1001', nullable: true })
  displayName!: string | null;

  @ApiProperty({ description: 'Mật khẩu SIP (plaintext)', example: 'p@ssw0rd!' })
  password!: string;

  @ApiProperty({ description: 'Tên tenant', example: 'Tenant One', nullable: true })
  tenantName!: string | null;

  @ApiProperty({ description: 'Domain tenant', example: 'tenant1.local', nullable: true })
  tenantDomain!: string | null;

  @ApiProperty({
    description: 'Proxy SIP sử dụng để đăng ký (ví dụ SIP IP hoặc domain)',
    example: 'sip:tenant1.local',
    nullable: true,
  })
  outboundProxy!: string | null;

  @ApiProperty({ description: 'Thời điểm tạo (ISO-8601)', example: '2024-07-21T00:12:34.000Z' })
  createdAt!: string;

  @ApiProperty({ description: 'Thời điểm cập nhật cuối (ISO-8601)', example: '2024-07-22T08:00:00.000Z' })
  updatedAt!: string;
}
