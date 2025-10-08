import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ListTopupsQueryDto {
  @ApiProperty({ description: 'Tenant cần xem lịch sử nạp quỹ' })
  @IsString()
  tenantId!: string;
}
