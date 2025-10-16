import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateExternalExtensionDto {
  @ApiPropertyOptional({
    description: 'Tenant ID (bắt buộc nếu không truyền qua query khi cập nhật)',
    maxLength: 64,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tenantId?: string;

  @ApiPropertyOptional({
    description: 'Mật khẩu SIP mới',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  password?: string;

  @ApiPropertyOptional({
    description: 'Tên hiển thị mới',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;
}
