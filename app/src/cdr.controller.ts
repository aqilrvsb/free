import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CdrService } from './cdr.service';

@Controller()
export class CdrController {
  constructor(private readonly cdrService: CdrService) {}

  @Post('/fs/cdr')
  @HttpCode(HttpStatus.ACCEPTED)
  async ingest(@Body() body: any, @Headers('x-cdr-token') token?: string): Promise<{ accepted: boolean }> {
    await this.cdrService.ingestCdr(body, token);
    return { accepted: true };
  }
}
