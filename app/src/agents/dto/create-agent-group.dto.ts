import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

export class CreateAgentGroupDto {
  @ApiProperty({ description: 'Tenant ID của nhóm' })
  @IsString()
  @Length(1, 64)
  tenantId!: string;

  @ApiProperty({ description: 'Tên nhóm quản lý' })
  @IsString()
  @Length(1, 255)
  name!: string;

  @ApiPropertyOptional({ description: 'Mô tả nhóm' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string | null;
}
