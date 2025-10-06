import { ApiProperty } from '@nestjs/swagger';

export class CdrIdParamDto {
  @ApiProperty({ description: 'ID bản ghi CDR (UUID)' })
  id!: string;
}
