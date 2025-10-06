import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePortalUserDto {
  @ApiProperty({ format: 'email', example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'StrongPass123!' })
  password!: string;

  @ApiPropertyOptional({ description: 'Tên hiển thị của người dùng' })
  displayName?: string | null;

  @ApiPropertyOptional({ description: 'Role portal được gán', example: 'viewer' })
  role?: string;

  @ApiPropertyOptional({ description: 'Trạng thái kích hoạt', default: true })
  isActive?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Danh sách quyền mở rộng' })
  permissions?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Danh sách tenant mà user được gán' })
  tenantIds?: string[];
}
