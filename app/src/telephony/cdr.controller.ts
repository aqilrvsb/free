import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { CdrService } from './cdr.service';
import { SwaggerTags } from '../swagger/swagger-tags';
import { CallUuidParamDto, CdrIdParamDto, ListCdrQueryDto } from './dto';

@ApiTags(SwaggerTags.Telephony)
@Controller()
export class CdrController {
  constructor(private readonly cdrService: CdrService) {}

  @Post('/fs/cdr')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({
    description: 'Payload CDR thô do FreeSWITCH gửi tới',
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  })
  async ingest(@Body() body: any): Promise<{ accepted: boolean }> {
    await this.cdrService.ingestCdr(body);
    return { accepted: true };
  }

  @Get('/cdr')
  async list(@Query() query: ListCdrQueryDto) {
    const page = Number(query.page ?? 1) || 1;
    const pageSize = Number(query.pageSize ?? 20) || 20;
    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;

    return this.cdrService.listCdrs({
      tenantId: query.tenantId?.trim() || undefined,
      direction: query.direction?.trim() || undefined,
      callUuid: query.callUuid?.trim() || undefined,
      fromNumber: query.fromNumber?.trim() || undefined,
      toNumber: query.toNumber?.trim() || undefined,
      status: query.status?.trim() || undefined,
      fromDate: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate : undefined,
      toDate: toDate && !Number.isNaN(toDate.getTime()) ? toDate : undefined,
      page,
      pageSize,
    });
  }

  @Get('/cdr/:id')
  async getById(@Param() params: CdrIdParamDto) {
    return this.cdrService.getById(params.id);
  }

  @Get('/cdr/call/:callUuid')
  async getByCallUuid(@Param() params: CallUuidParamDto) {
    const record = await this.cdrService.getByCallUuid(params.callUuid);
    if (!record) {
      return {};
    }
    return record;
  }
}
