import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreatePortalRoleDto } from './create-portal-role.dto';

export class UpdatePortalRoleDto extends PartialType(CreatePortalRoleDto) {
  @ApiPropertyOptional({ type: [String], description: 'Danh sách quyền cập nhật' })
  permissions?: string[];
}
