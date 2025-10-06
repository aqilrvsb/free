import { Controller, Get, Header, Query, Body, Post, HttpCode, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { FsService } from './fs.service';
import { FsRegistrationsGateway } from './fs-registrations.gateway';
import { SwaggerTags } from '../swagger/swagger-tags';
import { FsXmlGetQueryDto, FsXmlPostBodyDto } from './dto';

@ApiTags(SwaggerTags.FreeSWITCH)
@Controller()
export class FsXmlController {
  constructor(private readonly fsService: FsService, private readonly registrationsGateway: FsRegistrationsGateway) {}

  @Get('/health')
  health() {
    return { ok: true };
  }

  @Get('/fs/xml')
  @Header('Content-Type', 'application/xml')
  async handle(
    @Query() query: FsXmlGetQueryDto,
    @Req() req?: Request,
  ): Promise<string> {
    const { section, context, destination_number, domain, user } = query;
    if (req) {
      // eslint-disable-next-line no-console
      console.log('[fs/xml][query]', req.query);
    }
    return this.handleRequest({ section, context, destination_number, domain, user, source: 'GET', query: req?.query as Record<string, any> });
  }

  @Post('/fs/xml')
  @HttpCode(200)
  @Header('Content-Type', 'application/xml')
  async handlePost(@Body() body: FsXmlPostBodyDto, @Req() req: Request): Promise<string> {
    if (req?.body) {
      // eslint-disable-next-line no-console
      console.log('[fs/xml][body]', req.body);
    }
    return this.handleRequest({ section: body?.section, context: body?.context, destination_number: body?.destination_number, domain: body?.domain, user: body?.user, body, query: req?.query as Record<string, any> });
  }

  private async handleRequest(payload: {
    section?: string;
    context?: string;
    destination_number?: string;
    domain?: string;
    user?: string;
    body?: Record<string, any>;
    source?: string;
    query?: Record<string, any>;
  }): Promise<string> {
    const { section, body, query = {} } = payload;

    const pickValue = (source: Record<string, any> | undefined, keys: string[]): string | undefined => {
      if (!source) return undefined;
      for (const key of keys) {
        const val = source[key];
        if (typeof val === 'string' && val.trim()) return val.trim();
      }
      return undefined;
    };

    const sectionNorm = (section || pickValue(body, ['section']) || '').toLowerCase();
    let context = payload.context || pickValue(body, ['context', 'Caller-Context', 'variable_user_context']) || pickValue(query, ['context', 'Caller-Context']);
    const dest = payload.destination_number || pickValue(body, ['destination_number', 'Caller-Destination-Number', 'variable_destination_number']) || pickValue(query, ['destination_number', 'Caller-Destination-Number']);
    let domain = payload.domain || pickValue(body, ['domain', 'Caller-Domain', 'variable_domain_name', 'sip_auth_realm', 'variable_sip_auth_realm']) || pickValue(query, ['domain', 'Caller-Domain', 'sip_auth_realm']);
    let user = payload.user || pickValue(body, ['user', 'user_name', 'sip_auth_username', 'variable_user_name', 'Caller-Caller-ID-Number']) || pickValue(query, ['user', 'user_name', 'sip_auth_username']);

    // eslint-disable-next-line no-console
    console.log('[fs/xml]', { section: sectionNorm || section, context, destination_number: dest, domain, user });

    if (sectionNorm === 'directory') {
      this.triggerProfileRefresh(domain, context);
      return this.fsService.directoryXML({ user, domain });
    }
    if (sectionNorm === 'configuration') {
      return this.fsService.configurationXML({ tagName: payload.body?.tag_name, keyValue: payload.body?.key_value });
    }
    this.triggerProfileRefresh(domain, context);
    return this.fsService.dialplanXML({ context, destination_number: dest, domain });
  }

  private triggerProfileRefresh(domain?: string, context?: string): void {
    const profile = this.normalizeProfileIdentifier(domain, context);
    Promise.resolve(this.registrationsGateway.refreshProfile(profile)).catch((error) => {
      // eslint-disable-next-line no-console
      console.warn('[fs/xml] refreshProfile error', profile, error);
    });
  }

  private normalizeProfileIdentifier(domain?: string | null, context?: string | null): string {
    const domainValue = domain?.trim().toLowerCase();
    if (domainValue) {
      if (domainValue === 'internal' || domainValue.endsWith('.local')) {
        return 'internal';
      }
      if (domainValue === 'external' || domainValue.endsWith('.external')) {
        return 'external';
      }
    }

    const contextValue = context?.trim().toLowerCase();
    if (contextValue && contextValue.includes('internal')) {
      return 'internal';
    }
    if (contextValue && contextValue.includes('external')) {
      return 'external';
    }

    return 'internal';
  }
}
