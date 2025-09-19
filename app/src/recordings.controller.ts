import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { RecordingsService } from './recordings.service';

@Controller('recordings')
export class RecordingsController {
  constructor(private readonly recordingsService: RecordingsService) {}

  @Get()
  async list() {
    return this.recordingsService.listRecordings();
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
