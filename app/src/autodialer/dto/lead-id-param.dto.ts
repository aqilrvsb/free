import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LeadIdParamDto {
  @ApiProperty({ description: 'Lead ID' })
  @IsUUID()
  leadId!: string;
}
