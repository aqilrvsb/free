import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class UpdateAgentGroupDto {
  @ApiPropertyOptional({ description: 'Tên nhóm quản lý' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  name?: string | null;

  @ApiPropertyOptional({ description: 'Mô tả nhóm', nullable: true })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  description?: string | null;

  @ApiPropertyOptional({ description: 'Agent sở hữu nhóm', nullable: true })
  @IsOptional()
  @IsUUID()
  ownerAgentId?: string | null;
}
