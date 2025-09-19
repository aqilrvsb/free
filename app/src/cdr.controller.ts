import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { CdrService } from './cdr.service';

@Controller()
export class CdrController {
  constructor(private readonly cdrService: CdrService) {}

  @Post('/fs/cdr')
  @HttpCode(HttpStatus.ACCEPTED)
  async ingest(@Body() body: any): Promise<{ accepted: boolean }> {
    await this.cdrService.ingestCdr(body);
    return { accepted: true };
  }

  @Get('/cdr')
  async list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('tenantId') tenantId?: string,
    @Query('direction') direction?: string,
    @Query('callUuid') callUuid?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    return this.cdrService.listCdrs({
      tenantId: tenantId?.trim() || undefined,
      direction: direction?.trim() || undefined,
      callUuid: callUuid?.trim() || undefined,
      fromDate: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
      toDate: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
      page,
      pageSize,
    });
  }

  @Get('/cdr/:id')
  async getById(@Param('id') id: string) {
    return this.cdrService.getById(id);
  }

  @Get('/cdr/call/:callUuid')
  async getByCallUuid(@Param('callUuid') callUuid: string) {
    const record = await this.cdrService.getByCallUuid(callUuid);
    if (!record) {
      return {};
    }
    return record;
  }
}
