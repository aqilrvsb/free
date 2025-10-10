import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

class CreateLeadItemDto {
  @ApiProperty({ description: 'Số điện thoại cần gọi' })
  @IsString()
  @MaxLength(64)
  phoneNumber!: string;

  @ApiProperty({ description: 'Tên hoặc nhãn khách hàng', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({ description: 'Metadata bổ sung', required: false, type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateLeadsDto {
  @ApiProperty({ type: [CreateLeadItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  leads!: CreateLeadItemDto[];
}

export { CreateLeadItemDto };
