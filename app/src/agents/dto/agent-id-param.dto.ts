import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AgentIdParamDto {
  @ApiProperty({ description: 'Agent ID' })
  @IsUUID()
  id!: string;
}
