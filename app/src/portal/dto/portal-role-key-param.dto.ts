import { ApiProperty } from '@nestjs/swagger';

export class PortalRoleKeyParamDto {
  @ApiProperty({ description: 'Khoá role portal', example: 'super_admin' })
  key!: string;
}
