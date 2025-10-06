import { ApiPropertyOptional } from '@nestjs/swagger';

export class RecordingsListQueryDto {
  @ApiPropertyOptional({ type: Number, description: 'Trang (>=1)' })
  page?: string;

  @ApiPropertyOptional({ type: Number, description: 'Số bản ghi mỗi trang (tối đa 100)' })
  pageSize?: string;

  @ApiPropertyOptional({ description: 'Từ khoá tìm kiếm theo tên/path' })
  search?: string;
}
