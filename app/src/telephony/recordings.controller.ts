import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { RecordingsService } from './recordings.service';
import { SwaggerTags } from '../swagger/swagger-tags';
import { RecordingFilenameParamDto, RecordingsListQueryDto } from './dto';

@ApiTags(SwaggerTags.Telephony)
@Controller('recordings')
export class RecordingsController {
  constructor(private readonly recordingsService: RecordingsService) {}

  @Get()
  async list(@Query() query: RecordingsListQueryDto) {
    const page = Math.max(Number(query.page ?? 1) || 1, 1);
    const requestedPageSize = Number(query.pageSize ?? 25) || 25;
    const pageSize = Math.min(100, Math.max(1, requestedPageSize));
    const allRecordings = await this.recordingsService.listRecordings();
    const normalizedSearch = query.search?.trim().toLowerCase();
    const filtered = normalizedSearch
      ? allRecordings.filter((item) =>
          `${item.name} ${item.path}`.toLowerCase().includes(normalizedSearch),
        )
      : allRecordings;

    const total = filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(pageCount, Math.max(1, page));
    const start = (safePage - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return {
      items,
      total,
      page: safePage,
      pageSize,
    };
  }

  @Get(':filename')
  async download(@Param() params: RecordingFilenameParamDto, @Res() res: Response) {
    const { stream, metadata } = await this.recordingsService.getRecordingStream(params.filename);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', metadata.size.toString());
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.name}"`);
    stream.pipe(res);
  }
}
