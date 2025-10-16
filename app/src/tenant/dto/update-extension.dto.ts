import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateExtensionDto } from './create-extension.dto';

export class UpdateExtensionDto extends PartialType(CreateExtensionDto) {
  @ApiPropertyOptional({ description: 'Tenant của extension (bắt buộc khi có nhiều tenant trùng ID)', nullable: true })
  tenantId?: string;

  @ApiPropertyOptional({ description: 'Mật khẩu SIP mới', nullable: true })
  password?: string;

  @ApiPropertyOptional({ description: 'Tên hiển thị mới', nullable: true })
  displayName?: string;
}
