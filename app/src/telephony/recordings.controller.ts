import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { RecordingsService } from './recordings.service';

@Controller('recordings')
export class RecordingsController {
  constructor(private readonly recordingsService: RecordingsService) {}

  @Get()
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(25), ParseIntPipe) pageSize: number,
    @Query('search') search?: string,
  ) {
    const allRecordings = await this.recordingsService.listRecordings();
    const normalizedSearch = search?.trim().toLowerCase();
    const filtered = normalizedSearch
      ? allRecordings.filter((item) =>
          `${item.name} ${item.path}`.toLowerCase().includes(normalizedSearch),
        )
      : allRecordings;

    const safePageSize = Math.min(100, Math.max(1, pageSize));
    const total = filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / safePageSize));
    const safePage = Math.min(pageCount, Math.max(1, page));
    const start = (safePage - 1) * safePageSize;
    const items = filtered.slice(start, start + safePageSize);

    return {
      items,
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  @Get(':filename')
  async download(@Param('filename') filename: string, @Res() res: Response) {
    const { stream, metadata } = await this.recordingsService.getRecordingStream(filename);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', metadata.size.toString());
    res.setHeader('Content-Disposition', `attachment; filename="${metadata.name}"`);
    stream.pipe(res);
  }
}
