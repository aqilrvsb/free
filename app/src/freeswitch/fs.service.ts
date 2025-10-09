import { Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RoutingConfigEntity,
  TenantEntity,
  UserEntity,
  OutboundRuleEntity,
  InboundRouteEntity,
  IvrMenuEntity,
  BillingConfigEntity,
} from '../entities';
import { DialplanConfigService } from '../routing/dialplan-config.service';

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
    @InjectRepository(InboundRouteEntity) private readonly inboundRepo: Repository<InboundRouteEntity>,
    @InjectRepository(IvrMenuEntity) private readonly ivrMenuRepo: Repository<IvrMenuEntity>,
    @InjectRepository(BillingConfigEntity) private readonly billingRepo: Repository<BillingConfigEntity>,
    private readonly dialplanConfig: DialplanConfigService,
  ) {}

  async dialplanXML(params: DialplanParams): Promise<string> {
    const destRaw = (params.destination_number || '').trim();
    const dest = destRaw.replace(/\s+/g, '');

    let inboundRoute = dest ? await this.findInboundRoute(dest) : null;

    const resolved = await this.resolveTenant({
      domain: params.domain,
      context: params.context,
      destination: dest,
    });

    let tenant = inboundRoute?.tenant || resolved.tenant;
    let fallbackDomain = inboundRoute?.tenant?.domain || resolved.domain || tenant?.domain || 'default.local';
    let tenantId = tenant?.id || inboundRoute?.tenantId || 'tenant1';

    if (dest && (!inboundRoute || inboundRoute.tenantId !== tenantId)) {
      const tenantScoped = await this.findInboundRoute(dest, tenantId);
      if (tenantScoped) {
        inboundRoute = tenantScoped;
        tenant = tenantScoped.tenant;
        tenantId = tenantScoped.tenantId;
        fallbackDomain = tenantScoped.tenant?.domain || fallbackDomain;
      }
    }

    const [routing, billingConfig] = await Promise.all([
      this.routingRepo.findOne({ where: { tenantId } }),
      this.billingRepo.findOne({ where: { tenantId } }),
    ]);
    const routeCfg = routing || {
      internalPrefix: '9',
      voicemailPrefix: '*9',
      pstnGateway: 'pstn',
      enableE164: true,
      codecString: 'PCMU,PCMA,G722,OPUS',
    };

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
      if (inboundRoute) {
        return this.handleInboundRoute({
          route: inboundRoute,
          destination: dest,
          context,
          codecString,
          fallbackDomain,
          baseActions,
        });
      }

      const matchedCustom = await this.dialplanConfig.resolveForDestination({
        tenantId,
        destination: dest,
        context,
        domain: fallbackDomain,
      });

      if (matchedCustom) {
        const customExecuteOnAnswer: string[] = [];
        const actions: Array<{ app: string; data?: string }> = matchedCustom.rule.inheritDefault
          ? [...baseActions]
          : [];

        const shouldAutoRecord = matchedCustom.rule.recordingEnabled !== false;
        const hasCustomRecording = matchedCustom.actions.some(
          (action) =>
            action.app === 'record_session' ||
            (action.app === 'set' && action.data?.startsWith('execute_on_answer')),
        );
        if (shouldAutoRecord && !hasCustomRecording) {
          actions.push(...this.buildRecordingActions(dest || tenantId || 'dest', codecString, customExecuteOnAnswer));
        }
        if (customExecuteOnAnswer.length > 0) {
          actions.push({ app: 'set', data: `execute_on_answer=${customExecuteOnAnswer[0]}` });
          for (let index = 1; index < customExecuteOnAnswer.length; index += 1) {
            actions.push({ app: 'set', data: `execute_on_answer_${index + 1}=${customExecuteOnAnswer[index]}` });
          }
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
    const executeOnAnswer: string[] = [];

    const outboundRules = await this.outboundRepo.find({
      where: { tenantId, enabled: true },
      order: { priority: 'ASC', createdAt: 'ASC' },
      relations: ['gateway'],
    });

    const localUsers = await this.userRepo.find({ where: { tenantId } });
    const localUserSet = new Set(localUsers.map((u) => u.id));
    const hasLocalUser = (ext: string) => localUserSet.has(ext);

    let extBridge: string | null = null;
    let appliedOutboundRule: OutboundRuleEntity | null = null;

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
      const matched = outboundRules.find((rule) => this.matchesOutboundRule(rule, dest));

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
          appliedOutboundRule = matched;
        }
      }
    }

    const normalizedDigits = dest.replace(/^\+/, '');
    if (!extBridge && /^00\d{6,15}$/.test(dest)) {
      extBridge = `sofia/gateway/${pstnGateway}/${dest.substring(2)}`;
    } else if (!extBridge && /^\+?\d{6,15}$/.test(dest) && routeCfg.enableE164 !== false) {
      extBridge = `sofia/gateway/${pstnGateway}/${normalizedDigits}`;
    }

    const prepaidEnabled = Boolean(billingConfig?.prepaidEnabled);
    const balanceAmount = Number(billingConfig?.balanceAmount ?? 0);

    if (!extBridge) {
      actions.push({ app: 'answer' });
      actions.push({ app: 'playback', data: 'ivr/ivr-invalid_extension.wav' });
      actions.push({ app: 'hangup', data: 'NO_ROUTE_DESTINATION' });
    } else {
      const isGatewayBridge = extBridge.startsWith('sofia/gateway/');
      let prepaidAllowance: ReturnType<typeof this.calculatePrepaidAllowance> | null = null;
      if (isGatewayBridge && prepaidEnabled) {
        prepaidAllowance = this.calculatePrepaidAllowance({
          balance: balanceAmount,
          route: appliedOutboundRule,
          billingConfig,
        });
        if (prepaidAllowance?.type === 'insufficient') {
          const insufficientActions: Array<{ app: string; data?: string }> = [
            ...baseActions,
            { app: 'answer' },
            { app: 'playback', data: 'ivr/ivr-not_enough_credit.wav' },
            { app: 'hangup', data: 'NO_CREDIT' },
          ];
          return this.buildDialplanXml({
            context,
            extensionName: `no_credit_${dest || 'unknown'}`,
            destination: dest,
            actions: insufficientActions,
          });
        }
      }

      if (appliedOutboundRule) {
        actions.push(...this.buildBillingActions(appliedOutboundRule));
      }
      if (prepaidEnabled) {
        actions.push({ app: 'export', data: `billing_prepaid_enabled=true` });
        actions.push({ app: 'export', data: `billing_balance_start=${balanceAmount.toFixed(4)}` });
      }
      if (isGatewayBridge) {
        const callerNumberExpr = appliedOutboundRule?.gateway?.callerIdNumber?.trim() || '${effective_caller_id_number}';
        const callerNameExpr = appliedOutboundRule?.gateway?.callerIdName?.trim() || '${effective_caller_id_name}';

        actions.push({ app: 'set', data: `origination_caller_id_number=${callerNumberExpr}` });
        actions.push({ app: 'set', data: `origination_caller_id_name=${callerNameExpr}` });
        actions.push({ app: 'set', data: `effective_caller_id_number=${callerNumberExpr}` });
        actions.push({ app: 'set', data: `effective_caller_id_name=${callerNameExpr}` });
        actions.push({ app: 'set', data: `sip_from_user=${callerNumberExpr}` });
        actions.push({ app: 'set', data: `sip_from_display=${callerNameExpr}` });
        actions.push({ app: 'set', data: `sip_contact_user=${callerNumberExpr}` });
        actions.push({ app: 'set', data: `sip_from_uri=${callerNumberExpr}` });

        const gatewayHost = appliedOutboundRule?.gateway?.proxy?.trim() || appliedOutboundRule?.gateway?.realm?.trim();
        if (gatewayHost) {
          actions.push({ app: 'set', data: `sip_from_host=${gatewayHost}` });
          actions.push({ app: 'set', data: `sip_contact_host=${gatewayHost}` });
        }

        if (prepaidAllowance?.type === 'limited') {
          const hangupSeconds = Math.max(1, prepaidAllowance.allowedSeconds - 1);
          executeOnAnswer.push(`sched_hangup +${hangupSeconds} ALLOTTED_TIMEOUT`);
          actions.push({
            app: 'export',
            data: `prepaid_limit_seconds=${prepaidAllowance.allowedSeconds}`,
          });
        }
      }
      actions.push(...this.buildRecordingActions(dest || tenantId || 'dest', codecString, executeOnAnswer));
      if (executeOnAnswer.length > 0) {
        actions.push({ app: 'set', data: `execute_on_answer=${executeOnAnswer[0]}` });
        for (let index = 1; index < executeOnAnswer.length; index += 1) {
          actions.push({ app: 'set', data: `execute_on_answer_${index + 1}=${executeOnAnswer[index]}` });
        }
      }
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

  private async findInboundRoute(didNumber: string, tenantId?: string): Promise<InboundRouteEntity | null> {
    const where: Record<string, any> = { didNumber, enabled: true };
    if (tenantId) {
      where.tenantId = tenantId;
    }
    const route = await this.inboundRepo.findOne({
      where,
      order: { priority: 'ASC', createdAt: 'ASC' },
      relations: ['tenant'],
    });
    return route ?? null;
  }

  private async handleInboundRoute(params: {
    route: InboundRouteEntity;
    destination: string;
    context: string;
    codecString: string;
    fallbackDomain: string;
    baseActions: Array<{ app: string; data?: string }>;
  }): Promise<string> {
    const { route, destination, context, codecString, fallbackDomain, baseActions } = params;

    if (route.destinationType === 'ivr') {
      const menu = await this.ivrMenuRepo.findOne({ where: { id: route.destinationValue }, relations: ['options'] });
      if (!menu || !menu.options || menu.options.length === 0) {
        return this.buildDialplanXml({
          context,
          extensionName: `inbound_${route.id}`,
          destination,
          actions: [
            { app: 'playback', data: 'ivr/ivr-not_available.wav' },
            { app: 'hangup', data: 'NORMAL_TEMPORARY_FAILURE' },
          ],
        });
      }
      return this.buildIvrDialplan({ route, menu, destination, context, baseActions, fallbackDomain });
    }

    const actions: Array<{ app: string; data?: string }> = [...baseActions];
    const executeOnAnswer: string[] = [];

    switch (route.destinationType) {
      case 'extension': {
        const ext = route.destinationValue;
        actions.push(...this.buildRecordingActions(ext, codecString, executeOnAnswer));
        actions.push({ app: 'bridge', data: `user/${ext}@${fallbackDomain}` });
        break;
      }
      case 'sip_uri': {
        actions.push(...this.buildRecordingActions(route.destinationValue, codecString, executeOnAnswer));
        actions.push({ app: 'bridge', data: route.destinationValue });
        break;
      }
      case 'voicemail': {
        actions.push({ app: 'answer' });
        actions.push({ app: 'sleep', data: '250' });
        actions.push({ app: 'voicemail', data: `default ${fallbackDomain} ${route.destinationValue}` });
        actions.push({ app: 'hangup', data: 'NORMAL_CLEARING' });
        break;
      }
      default: {
        actions.push({ app: 'hangup', data: 'UNALLOCATED_NUMBER' });
        break;
      }
    }

    if (executeOnAnswer.length > 0) {
      actions.push({ app: 'set', data: `execute_on_answer=${executeOnAnswer[0]}` });
      for (let index = 1; index < executeOnAnswer.length; index += 1) {
        actions.push({ app: 'set', data: `execute_on_answer_${index + 1}=${executeOnAnswer[index]}` });
      }
    }

    return this.buildDialplanXml({
      context,
      extensionName: `inbound_${route.id}`,
      destination,
      actions,
    });
  }

  private buildIvrDialplan(params: {
    route: InboundRouteEntity;
    menu: IvrMenuEntity;
    destination: string;
    context: string;
    baseActions: Array<{ app: string; data?: string }>;
    fallbackDomain: string;
  }): string {
    const { route, menu, destination, context, baseActions, fallbackDomain } = params;
    const doc = create({ version: '1.0' });
    const documentNode = doc.ele('document', { type: 'freeswitch/xml' });
    const sectionNode = documentNode.ele('section', { name: 'dialplan' });
    const contextNode = sectionNode.ele('context', { name: context });

    const mainExtension = contextNode.ele('extension', { name: `inbound_${route.id}` });
    const mainCondition = mainExtension.ele('condition', { field: 'destination_number', expression: `^${destination}$` });

    for (const action of baseActions) {
      if (action.data) {
        mainCondition.ele('action', { application: action.app, data: action.data }).up();
      } else {
        mainCondition.ele('action', { application: action.app }).up();
      }
    }

    mainCondition.ele('action', { application: 'answer' }).up();
    mainCondition.ele('action', { application: 'sleep', data: '250' }).up();

    const prompt = menu.greetingAudioUrl || 'ivr/ivr-welcome_to_freeswitch.wav';
    const invalidPrompt = menu.invalidAudioUrl || 'ivr/ivr-invalid_entry.wav';
    const digitVar = `ivr_menu_${menu.id}_digit`;
    const timeoutMs = Math.max(1, menu.timeoutSeconds || 5) * 1000;
    const maxRetries = Math.max(1, menu.maxRetries || 3);

    mainCondition
      .ele('action', {
        application: 'play_and_get_digits',
        data: `1 1 ${maxRetries} ${timeoutMs} # ${prompt} ${invalidPrompt} ${digitVar}`,
      })
      .up();

    mainCondition
      .ele('action', { application: 'execute_extension', data: `ivr_menu_${menu.id} XML ${context}` })
      .up();

    const menuExtension = contextNode.ele('extension', { name: `ivr_menu_${menu.id}` });
    const menuCondition = menuExtension.ele('condition', { field: 'destination_number', expression: `^ivr_menu_${menu.id}$` });

    const sortedOptions = [...(menu.options || [])].sort((a, b) => {
      if (a.position !== b.position) {
        return a.position - b.position;
      }
      return a.digit.localeCompare(b.digit);
    });

    const digitField = '${' + digitVar + '}';

    for (const option of sortedOptions) {
      const optionCondition = menuCondition.ele('condition', {
        field: digitField,
        expression: `^${option.digit}$`,
        break: 'on-true',
      });

      switch (option.actionType) {
        case 'extension':
          optionCondition.ele('action', { application: 'transfer', data: `${option.actionValue} XML ${context}` }).up();
          break;
        case 'sip_uri':
          optionCondition.ele('action', { application: 'bridge', data: option.actionValue || '' }).up();
          break;
        case 'voicemail':
          optionCondition.ele('action', {
            application: 'voicemail',
            data: `default ${fallbackDomain} ${option.actionValue}`,
          }).up();
          break;
        case 'hangup':
        default:
          optionCondition.ele('action', { application: 'hangup', data: 'NORMAL_CLEARING' }).up();
          break;
      }

      optionCondition.up();
    }

    menuCondition
      .ele('action', { application: 'playback', data: invalidPrompt })
      .up()
      .ele('action', { application: 'hangup', data: 'NORMAL_CLEARING' })
      .up();

    return doc.end({ prettyPrint: true });
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

  private calculatePrepaidAllowance(args: {
    balance: number;
    route?: OutboundRuleEntity | null;
    billingConfig?: BillingConfigEntity | null;
  }): { type: 'insufficient' } | { type: 'unlimited' } | { type: 'limited'; allowedSeconds: number } {
    const balance = Math.max(0, this.toNumber(args.balance));
    const route = args.route ?? null;
    const config = args.billingConfig ?? null;

    const billingEnabled = Boolean(route?.billingEnabled);
    const ratePerMinute = billingEnabled
      ? this.toNumber(route?.billingRatePerMinute)
      : this.toNumber(config?.defaultRatePerMinute);
    const setupFee = billingEnabled
      ? this.toNumber(route?.billingSetupFee)
      : this.toNumber(config?.defaultSetupFee);
    const increment = Math.max(
      1,
      billingEnabled
        ? Number(route?.billingIncrementSeconds ?? 60) || 60
        : Number(config?.defaultIncrementSeconds ?? 60) || 60,
    );

    if (balance <= 0) {
      return { type: 'insufficient' };
    }

    const normalizedSetupFee = Math.max(0, setupFee);
    const normalizedRate = Math.max(0, ratePerMinute);
    const perUnitCharge = normalizedRate > 0 ? (normalizedRate * increment) / 60 : 0;

    if (perUnitCharge <= 0) {
      if (normalizedSetupFee > 0 && balance < normalizedSetupFee) {
        return { type: 'insufficient' };
      }
      return { type: 'unlimited' };
    }

    const spendable = balance - normalizedSetupFee;
    if (spendable < perUnitCharge) {
      return { type: 'insufficient' };
    }

    const units = Math.max(1, Math.floor(spendable / perUnitCharge));
    const allowedSeconds = units * increment;
    if (!Number.isFinite(allowedSeconds) || allowedSeconds <= 0) {
      return { type: 'insufficient' };
    }
    return { type: 'limited', allowedSeconds };
  }

  private toNumber(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) {
      return 0;
    }
    return num;
  }

  private safeFilename(value: string): string {
    const base = value || 'unknown';
    return base.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  private buildRecordingActions(
    target: string,
    codecString: string,
    executeOnAnswer: string[],
  ): Array<{ app: string; data?: string }> {
    const filenameSuffix = this.safeFilename(target || 'dest');
    const recordingFile = '$${recordings_dir}/${uuid}-' + filenameSuffix + '.wav';
    const actions: Array<{ app: string; data?: string }> = [
      { app: 'set', data: `recording_file=${recordingFile}` },
      { app: 'export', data: `recording_file=${recordingFile}` },
      { app: 'export', data: `nolocal:recording_file=${recordingFile}` },
      { app: 'export', data: `nolocal:absolute_codec_string=${codecString}` },
      { app: 'export', data: `nolocal:outbound_codec_prefs=${codecString}` },
      { app: 'export', data: 'recording_follow_transfer=true' },
      { app: 'record_session', data: recordingFile },
    ];
    return actions;
  }

  private buildBillingActions(rule: OutboundRuleEntity): Array<{ app: string; data?: string }> {
    const actions: Array<{ app: string; data?: string }> = [];
    const exportVar = (name: string, value: string | number | boolean | null | undefined) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      actions.push({ app: 'export', data: `${name}=${value}` });
    };

    exportVar('billing_route_id', rule.id);
    exportVar('billing_enabled', rule.billingEnabled ? 'true' : 'false');

    if (rule.billingCid) {
      exportVar('billing_cid', rule.billingCid);
    }

    if (rule.billingEnabled) {
      const rate = Number(rule.billingRatePerMinute ?? 0) || 0;
      const setupFee = Number(rule.billingSetupFee ?? 0) || 0;
      const increment = rule.billingIncrementSeconds ?? 60;
      exportVar('billing_rate_per_min', rate.toFixed(4));
      exportVar('billing_increment_seconds', increment > 0 ? increment : 60);
      exportVar('billing_setup_fee', setupFee.toFixed(4));
    }

    return actions;
  }

  private pickCodecString(value?: string | null): string {
    const fallback = 'PCMU,PCMA,G722,OPUS';
    if (!value) {
      return fallback;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  private matchesOutboundRule(rule: OutboundRuleEntity, destination: string): boolean {
    const pattern = rule.matchPrefix?.trim();
    if (!pattern) {
      return true;
    }
    try {
      const regex = new RegExp(pattern);
      return regex.test(destination);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[dialplan] Outbound rule có regex không hợp lệ', pattern, error);
      return false;
    }
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
