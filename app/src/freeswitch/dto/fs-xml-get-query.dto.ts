import { ApiPropertyOptional } from '@nestjs/swagger';

export class FsXmlGetQueryDto {
  @ApiPropertyOptional({ description: 'Loại request FreeSWITCH đang gọi (dialplan/directory/configuration)' })
  section?: string;

  @ApiPropertyOptional({ description: 'Ngữ cảnh cuộc gọi' })
  context?: string;

  @ApiPropertyOptional({ description: 'Số đích FreeSWITCH chuyển vào' })
  destination_number?: string;

  @ApiPropertyOptional({ description: 'Domain hoặc SIP realm của cuộc gọi' })
  domain?: string;

  @ApiPropertyOptional({ description: 'Tên user/extension yêu cầu' })
  user?: string;
}
