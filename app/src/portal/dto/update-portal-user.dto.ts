import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreatePortalUserDto } from './create-portal-user.dto';

export class UpdatePortalUserDto extends PartialType(CreatePortalUserDto) {
  @ApiPropertyOptional({ type: [String], nullable: true, description: 'Danh sách tenant mới hoặc null để xoá tất cả' })
  tenantIds?: string[] | null;
}
