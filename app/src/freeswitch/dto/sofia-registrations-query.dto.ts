import { ApiPropertyOptional } from '@nestjs/swagger';

export class SofiaRegistrationsQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo tenant id' })
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Lọc theo trạng thái (all/online/offline)' })
  status?: string;

  @ApiPropertyOptional({ description: 'Từ khoá tìm kiếm' })
  search?: string;
}
