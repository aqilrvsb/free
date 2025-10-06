import { ApiPropertyOptional } from '@nestjs/swagger';

export class TenantFilterQueryDto {
  @ApiPropertyOptional({ description: 'Lọc theo tenant id' })
  tenantId?: string;
}
