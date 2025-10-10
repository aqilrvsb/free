import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListAgentGroupsQueryDto {
  @ApiPropertyOptional({ description: 'Tenant ID cần lọc' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ type: Number, description: 'Trang (>=1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ type: Number, description: 'Số bản ghi mỗi trang' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
