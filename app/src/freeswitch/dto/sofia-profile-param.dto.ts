import { ApiProperty } from '@nestjs/swagger';

export class SofiaProfileParamDto {
  @ApiProperty({ description: 'Tên profile Sofia (ví dụ: internal, external)' })
  profile!: string;
}
