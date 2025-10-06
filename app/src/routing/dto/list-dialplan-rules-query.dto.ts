import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListDialplanRulesQueryDto {
  @ApiPropertyOptional({ description: 'Lọc rule theo tenant id' })
  tenantId?: string;
}
