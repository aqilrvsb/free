import { ApiProperty } from '@nestjs/swagger';

export class OutboundCallerIdIdParamDto {
  @ApiProperty({ description: 'ID Caller ID' })
  id!: string;
}
