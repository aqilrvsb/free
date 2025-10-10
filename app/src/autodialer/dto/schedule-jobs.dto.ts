import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ScheduleJobsDto {
  @ApiPropertyOptional({ description: 'Số lượng lead cần lên lịch', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional({ description: 'Thời điểm lên lịch bắt đầu (ISO datetime)' })
  @IsOptional()
  @IsDateString()
  startAt?: string;
}
