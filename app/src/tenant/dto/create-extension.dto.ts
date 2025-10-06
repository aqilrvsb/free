import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExtensionDto {
  @ApiProperty({ description: 'Số máy nhánh', example: '1001' })
  id!: string;

  @ApiProperty({ description: 'Tenant mà máy nhánh thuộc về', example: 'tenant1' })
  tenantId!: string;

  @ApiPropertyOptional({ description: 'Mật khẩu SIP', nullable: true })
  password?: string;

  @ApiPropertyOptional({ description: 'Tên hiển thị', nullable: true })
  displayName?: string;
}
