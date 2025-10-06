import { ApiPropertyOptional } from '@nestjs/swagger';

export class FsXmlPostBodyDto {
  @ApiPropertyOptional({ description: 'Loại request FreeSWITCH đang gọi', example: 'dialplan' })
  section?: string;

  @ApiPropertyOptional({ description: 'Ngữ cảnh cuộc gọi', example: 'default' })
  context?: string;

  @ApiPropertyOptional({ description: 'Số đích', example: '1000' })
  destination_number?: string;

  @ApiPropertyOptional({ description: 'Domain hoặc SIP realm', example: 'pbx.local' })
  domain?: string;

  @ApiPropertyOptional({ description: 'Tên user/extension yêu cầu', example: '1000' })
  user?: string;

  [key: string]: any;
}
