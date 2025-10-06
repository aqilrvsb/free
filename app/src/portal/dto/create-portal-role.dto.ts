import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePortalRoleDto {
  @ApiProperty({ description: 'Khoá role', example: 'viewer' })
  key!: string;

  @ApiProperty({ description: 'Tên hiển thị của role', example: 'Viewer' })
  name!: string;

  @ApiPropertyOptional({ description: 'Mô tả role', nullable: true })
  description?: string | null;

  @ApiProperty({ type: [String], description: 'Danh sách quyền' })
  permissions!: string[];
}
