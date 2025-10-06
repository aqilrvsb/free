import { ApiProperty } from '@nestjs/swagger';

export class ExtensionIdParamDto {
  @ApiProperty({ description: 'Số máy nhánh' })
  id!: string;
}
