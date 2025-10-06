import { ApiProperty } from '@nestjs/swagger';

export class CallUuidParamDto {
  @ApiProperty({ description: 'UUID cuộc gọi' })
  callUuid!: string;
}
