import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListIvrMenuQueryDto {
  @ApiPropertyOptional({ description: 'Lọc IVR theo tenant' })
  tenantId?: string;
}
