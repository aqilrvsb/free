import { ApiProperty } from '@nestjs/swagger';

export class TenantIdParamDto {
  @ApiProperty({ description: 'ID tenant' })
  id!: string;
}
