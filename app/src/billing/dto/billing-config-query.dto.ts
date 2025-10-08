import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class BillingConfigQueryDto {
  @ApiProperty({ description: 'Tenant cần lấy cấu hình billing' })
  @IsString()
  tenantId!: string;
}
