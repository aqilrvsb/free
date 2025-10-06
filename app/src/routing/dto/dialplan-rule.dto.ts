import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DialplanActionDto } from './dialplan-action.dto';

export class DialplanRuleDto {
  @ApiProperty({ description: 'Tenant ID áp dụng rule' })
  tenantId!: string;

  @ApiProperty({ description: 'Tên rule', example: 'Internal Dialing' })
  name!: string;

  @ApiPropertyOptional({ description: 'Mô tả rule', nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ description: 'Loại dialplan', example: 'internal' })
  kind?: 'internal' | 'external';

  @ApiPropertyOptional({ description: 'Kiểu match', example: 'regex' })
  matchType?: 'regex' | 'prefix' | 'exact';

  @ApiPropertyOptional({ description: 'Pattern khớp', example: '^1(.*)$' })
  pattern?: string;

  @ApiPropertyOptional({ description: 'Ưu tiên thực thi', example: 0 })
  priority?: number;

  @ApiPropertyOptional({ description: 'Context dialplan', nullable: true })
  context?: string | null;

  @ApiPropertyOptional({ description: 'Extension tạo ra', nullable: true })
  extension?: string | null;

  @ApiPropertyOptional({ description: 'Có bật rule hay không', default: true })
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Kế thừa rule mặc định', default: true })
  inheritDefault?: boolean;

  @ApiPropertyOptional({ description: 'Tự động ghi âm cuộc gọi', default: true })
  recordingEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Dừng khi match', default: true })
  stopOnMatch?: boolean;

  @ApiPropertyOptional({ type: [DialplanActionDto], description: 'Danh sách action đi kèm' })
  actions?: DialplanActionDto[];
}
