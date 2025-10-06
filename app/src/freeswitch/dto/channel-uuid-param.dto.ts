import { ApiProperty } from '@nestjs/swagger';

export class ChannelUuidParamDto {
  @ApiProperty({ description: 'UUID của kênh cần ngắt' })
  uuid!: string;
}
