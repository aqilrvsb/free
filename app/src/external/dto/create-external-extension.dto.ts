import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateExternalExtensionDto {
  @ApiProperty({
    description: 'Mã extension duy nhất trong hệ thống (ví dụ 1001)',
    minLength: 1,
    maxLength: 32,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  id!: string;

  @ApiProperty({
    description: 'ID của tenant sở hữu extension',
    minLength: 1,
    maxLength: 64,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  tenantId!: string;

  @ApiProperty({
    description: 'Mật khẩu SIP cho extension. Nếu bỏ trống hệ thống sẽ tự sinh.',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  password?: string;

  @ApiProperty({
    description: 'Tên hiển thị khi gọi (optional)',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;
}
