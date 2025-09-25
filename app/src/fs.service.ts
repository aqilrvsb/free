import { Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoutingConfigEntity, TenantEntity, UserEntity, OutboundRuleEntity } from './entities';
import { DialplanConfigService } from './dialplan-config.service';

interface DialplanParams {
  context?: string;
  destination_number?: string;
  domain?: string;
}

interface DirectoryParams {
  user?: string;
  domain?: string;
}

interface ConfigurationParams {
  tagName?: string;
  keyValue?: string;
}

interface ResolvedTenant {
  tenant: TenantEntity | null;
  domain: string;
}

@Injectable()
export class FsService {
  constructor(
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
    @InjectRepository(UserEntity) private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(RoutingConfigEntity) private readonly routingRepo: Repository<RoutingConfigEntity>,
    @InjectRepository(OutboundRuleEntity) private readonly outboundRepo: Repository<OutboundRuleEntity>,
    private readonly dialplanConfig: DialplanConfigService,
  ) {}

  async dialplanXML(params: DialplanParams): Promise<string> {
    const destRaw = (params.destination_number || '').trim();
    const dest = destRaw.replace(/\s+/g, '');

    const { tenant, domain } = await this.resolveTenant({
      domain: params.domain,
      context: params.context,
      destination: dest,
    });

    const fallbackDomain = domain || tenant?.domain || 'default.local';
    const tenantId = tenant?.id || 'tenant1';

    const routing = await this.routingRepo.findOne({ where: { tenantId } });
    const routeCfg = routing || {
      internalPrefix: '9',
      voicemailPrefix: '*9',
      pstnGateway: 'pstn',
      enableE164: true,
      codecString: 'PCMU,PCMA,G722,OPUS',
    };

    const outboundRules = await this.outboundRepo.find({
      where: { tenantId, enabled: true },
      order: { priority: 'ASC', createdAt: 'ASC' },
      relations: ['gateway'],
    });

    const codecString = this.pickCodecString(routeCfg?.codecString);
    const context = params.context || `context_${tenantId}`;
    const internalPrefix: string = routeCfg.internalPrefix || '9';
    const vmPrefix: string = routeCfg.voicemailPrefix || '*9';
    const pstnGateway: string = routeCfg.pstnGateway || 'pstn';

    const baseActions: Array<{ app: string; data?: string }> = [
      { app: 'set', data: 'ringback=${us-ring}' },
      { app: 'set', data: 'hangup_after_bridge=true' },
    ];

    if (dest) {
      const matchedCustom = await this.dialplanConfig.resolveForDestination({
        tenantId,
        destination: dest,
        context,
        domain: fallbackDomain,
      });

      if (matchedCustom) {
        const actions: Array<{ app: string; data?: string }> = matchedCustom.rule.inheritDefault
          ? [...baseActions]
          : [];

        const shouldAutoRecord = matchedCustom.rule.recordingEnabled !== false;
        const hasCustomRecording = matchedCustom.actions.some((action) => action.app === 'record_session');
        if (shouldAutoRecord && !hasCustomRecording) {
          actions.push(...this.buildRecordingActions(dest || tenantId || 'dest', codecString));
        }

        actions.push(...matchedCustom.actions);

        return this.buildDialplanXml({
          context: matchedCustom.context,
          extensionName: matchedCustom.extensionName,
          destination: dest,
          actions,
        });
      }
    }

    const actions: Array<{ app: string; data?: string }> = [...baseActions];

    const localUsers = await this.userRepo.find({ where: { tenantId } });
    const localUserSet = new Set(localUsers.map((u) => u.id));
    const hasLocalUser = (ext: string) => localUserSet.has(ext);

    let extBridge: string | null = null;

    if (!extBridge && /^\d{2,6}$/.test(dest) && hasLocalUser(dest)) {
      extBridge = `user/${dest}@${fallbackDomain}`;
    }

    if (!extBridge && internalPrefix && dest.startsWith(internalPrefix)) {
      const ext = dest.substring(internalPrefix.length);
      if (ext && hasLocalUser(ext)) {
        extBridge = `user/${ext}@${fallbackDomain}`;
      }
    }

    if (!extBridge && vmPrefix && dest.startsWith(vmPrefix)) {
      const ext = dest.substring(vmPrefix.length);
      if (ext && hasLocalUser(ext)) {
        actions.push({ app: 'lua', data: `voicemail.lua ${fallbackDomain} ${ext}` });
        return this.buildDialplanXml({
          context,
          extensionName: `vm_${dest}`,
          destination: dest,
          actions,
        });
      }
    }

    if (!extBridge && dest.includes('@')) {
      const [userPart, domainPart] = dest.split('@');
      if (userPart && domainPart) {
        extBridge = `user/${userPart}@${domainPart}`;
      }
    }

    if (!extBridge && outboundRules.length > 0) {
      const matched = outboundRules.find((rule) => {
        const prefix = rule.matchPrefix || '';
        if (!prefix) return true;
        return dest.startsWith(prefix);
      });

      if (matched) {
        let dialNumber = dest;

        if (matched.stripDigits && matched.stripDigits > 0) {
          if (matched.stripDigits >= dialNumber.length) {
            dialNumber = '';
          } else {
            dialNumber = dialNumber.substring(matched.stripDigits);
          }
        }

        if (matched.prepend) {
          dialNumber = `${matched.prepend}${dialNumber}`;
        }

        const gwName = matched.gateway?.name || pstnGateway || null;
        if (gwName && dialNumber) {
          extBridge = `sofia/gateway/${gwName}/${dialNumber}`;
        }
      }
    }

    const normalizedDigits = dest.replace(/^\+/, '');
    if (!extBridge && /^00\d{6,15}$/.test(dest)) {
      extBridge = `sofia/gateway/${pstnGateway}/${dest.substring(2)}`;
    } else if (!extBridge && /^\+?\d{6,15}$/.test(dest) && routeCfg.enableE164 !== false) {
      extBridge = `sofia/gateway/${pstnGateway}/${normalizedDigits}`;
    }

    if (!extBridge) {
      actions.push({ app: 'answer' });
      actions.push({ app: 'playback', data: 'ivr/ivr-invalid_extension.wav' });
      actions.push({ app: 'hangup', data: 'NO_ROUTE_DESTINATION' });
    } else {
      actions.push(...this.buildRecordingActions(dest || tenantId || 'dest', codecString));
      actions.push({ app: 'bridge', data: extBridge });
    }

    return this.buildDialplanXml({
      context,
      extensionName: `dyn_${dest || 'unknown'}`,
      destination: dest,
      actions,
    });
  }

  async directoryXML(params: DirectoryParams): Promise<string> {
    const userIdRaw = (params.user || '').trim();
    const userId = userIdRaw || 'unknown';
    const { tenant, domain } = await this.resolveTenant({ domain: params.domain, userId: userIdRaw });
    const tenantId = tenant?.id || 'tenant1';
    const realm = tenant?.domain || domain || 'default.local';
    const context = `context_${tenantId}`;

    let userRecord: UserEntity | null = null;
    if (userIdRaw) {
      userRecord = await this.userRepo.findOne({ where: { id: userIdRaw, tenantId } });
    }

    const password = userRecord?.password || '1234';
    const a1Hash = createHash('md5').update(`${userId}:${realm}:${password}`).digest('hex');
    const builder = create({ version: '1.0' });
    const documentNode = builder.ele('document', { type: 'freeswitch/xml' });
    const sectionNode = documentNode.ele('section', { name: 'directory' });
    const domainNode = sectionNode.ele('domain', { name: realm });
    const userNode = domainNode.ele('user', { id: userId });

    const paramsNode = userNode.ele('params');
    paramsNode.ele('param', { name: 'password', value: password });
    paramsNode.ele('param', { name: 'a1-hash', value: a1Hash });
    paramsNode.ele('param', {
      name: 'dial-string',
      value:
        '{sip_invite_domain=${domain_name},presence_id=${dialed_user}@${domain_name}}${sofia_contact(${dialed_user}@${domain_name})}',
    });

    const variablesNode = userNode.ele('variables');
    variablesNode.ele('variable', { name: 'user_context', value: context });
    if (userRecord?.displayName) {
      variablesNode.ele('variable', { name: 'effective_caller_id_name', value: userRecord.displayName });
    }

    return builder.end({ prettyPrint: true });
  }

  configurationXML(_params: ConfigurationParams = {}): string {
    const builder = create({ version: '1.0' });
    builder
      .ele('document', { type: 'freeswitch/xml' })
      .ele('section', { name: 'result' })
      .ele('result', { status: 'not found' });

    return builder.end({ prettyPrint: true });
  }

  private async resolveTenant(args: {
    domain?: string;
    context?: string;
    destination?: string;
    userId?: string;
  }): Promise<ResolvedTenant> {
    let normalizedDomain = (args.domain || '').trim();
    let tenant: TenantEntity | null = null;

    if (normalizedDomain) {
      tenant = await this.tenantRepo.findOne({ where: { domain: normalizedDomain } });
      normalizedDomain = tenant?.domain || normalizedDomain;
    }

    if (!tenant && args.context?.startsWith('context_')) {
      const ctxTenantId = args.context.replace('context_', '');
      tenant = await this.tenantRepo.findOne({ where: { id: ctxTenantId } });
      if (tenant) {
        normalizedDomain = tenant.domain;
      }
    }

    if (!tenant && args.destination) {
      const destUser = await this.findUserForDestination(args.destination);
      if (destUser) {
        tenant = await this.tenantRepo.findOne({ where: { id: destUser.tenantId } });
        if (tenant) {
          normalizedDomain = tenant.domain;
        }
      }
    }

    if (!tenant && args.userId) {
      const user = await this.userRepo.findOne({ where: { id: args.userId } });
      if (user) {
        tenant = await this.tenantRepo.findOne({ where: { id: user.tenantId } });
        if (tenant) {
          normalizedDomain = tenant.domain;
        }
      }
    }

    if (!tenant) {
      const [firstTenant] = await this.tenantRepo.find({ order: { createdAt: 'ASC' }, take: 1 });
      if (firstTenant) {
        tenant = firstTenant;
        normalizedDomain = firstTenant.domain;
      }
    }

    return { tenant, domain: normalizedDomain };
  }

  private buildDialplanXml(params: {
    context: string;
    extensionName: string;
    destination: string;
    actions: Array<{ app: string; data?: string }>;
  }): string {
    const doc = create({ version: '1.0' })
      .ele('document', { type: 'freeswitch/xml' })
      .ele('section', { name: 'dialplan' })
      .ele('context', { name: params.context })
      .ele('extension', { name: params.extensionName })
      .ele('condition', { field: 'destination_number', expression: `^${params.destination}$` });

    for (const action of params.actions) {
      if (action.data) {
        doc.ele('action', { application: action.app, data: action.data }).up();
      } else {
        doc.ele('action', { application: action.app }).up();
      }
    }

    return doc.end({ prettyPrint: true });
  }

  private safeFilename(value: string): string {
    const base = value || 'unknown';
    return base.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private buildRecordingActions(target: string, codecString: string): Array<{ app: string; data?: string }> {
    const filenameSuffix = this.safeFilename(target || 'dest');
    const recordingFile = '$${recordings_dir}/${uuid}-' + filenameSuffix + '.wav';
    return [
      { app: 'set', data: `recording_file=${recordingFile}` },
      { app: 'record_session', data: recordingFile },
      { app: 'export', data: `nolocal:absolute_codec_string=${codecString}` },
      { app: 'export', data: `nolocal:outbound_codec_prefs=${codecString}` },
    ];
  }

  private pickCodecString(value?: string | null): string {
    const fallback = 'PCMU,PCMA,G722,OPUS';
    if (!value) {
      return fallback;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  private async findUserForDestination(destination: string): Promise<UserEntity | null> {
    const candidates: string[] = [];
    const trimmed = destination.trim();
    if (trimmed) {
      candidates.push(trimmed);
    }
    const digitsOnly = trimmed.replace(/\D/g, '');
    if (digitsOnly && digitsOnly !== trimmed) {
      candidates.push(digitsOnly);
    }

    let stripIndex = 1;
    while (digitsOnly && stripIndex < digitsOnly.length) {
      candidates.push(digitsOnly.substring(stripIndex));
      stripIndex += 1;
    }

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const user = await this.userRepo.findOne({ where: { id: candidate } });
      if (user) {
        return user;
      }
    }

    return null;
  }
}
