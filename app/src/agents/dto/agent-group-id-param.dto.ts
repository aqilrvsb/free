import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AgentGroupIdParamDto {
  @ApiProperty({ description: 'Agent group ID' })
  @IsUUID()
  id!: string;
}
