import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CampaignIdParamDto {
  @ApiProperty({ description: 'ID chiến dịch' })
  @IsUUID()
  id!: string;
}
