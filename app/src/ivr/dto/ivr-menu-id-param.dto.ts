import { ApiProperty } from '@nestjs/swagger';

export class IvrMenuIdParamDto {
  @ApiProperty({ description: 'ID IVR menu' })
  id!: string;
}
