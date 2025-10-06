import { ApiProperty } from '@nestjs/swagger';

export class DialplanRuleIdParamDto {
  @ApiProperty({ description: 'ID rule dialplan' })
  id!: string;
}
