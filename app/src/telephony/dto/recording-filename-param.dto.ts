import { ApiProperty } from '@nestjs/swagger';

export class RecordingFilenameParamDto {
  @ApiProperty({ description: 'Tên file ghi âm (đã encode URI)' })
  filename!: string;
}
