import { ApiProperty } from '@nestjs/swagger';

export class OutboundRouteIdParamDto {
  @ApiProperty({ description: 'ID outbound route' })
  id!: string;
}
