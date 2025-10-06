import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListExtensionsQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo tenant id' })
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Từ khoá tìm kiếm theo số máy / tên' })
  search?: string;

  @ApiPropertyOptional({ type: Number, description: 'Trang (>=1). Bỏ trống hoặc 0 để lấy toàn bộ.' })
  page?: string;

  @ApiPropertyOptional({ type: Number, description: 'Số bản ghi mỗi trang. Bỏ trống hoặc 0 để lấy toàn bộ.' })
  pageSize?: string;
}
