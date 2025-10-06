import { ApiProperty } from '@nestjs/swagger';

export class InboundRouteIdParamDto {
  @ApiProperty({ description: 'ID inbound route' })
  id!: string;
}
