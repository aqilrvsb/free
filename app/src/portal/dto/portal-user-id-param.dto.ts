import { ApiProperty } from '@nestjs/swagger';

export class PortalUserIdParamDto {
  @ApiProperty({ description: 'ID người dùng portal (UUID)' })
  id!: string;
}
