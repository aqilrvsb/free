import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class ListAgentsQueryDto {
  @ApiPropertyOptional({ description: 'Tenant ID cần lọc' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Agent group ID cần lọc' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ description: 'Từ khóa tìm kiếm (tên, extension)' })
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
