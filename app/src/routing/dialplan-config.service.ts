import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import {
  DialplanActionEntity,
  DialplanRuleEntity,
  DialplanRuleKind,
  DialplanRuleMatchType,
  TenantEntity,
} from '../entities';

export interface DialplanActionInput {
  id?: string;
  position?: number;
  application: string;
  data?: string | null;
}

export interface DialplanRuleInput {
  tenantId: string;
  name: string;
  description?: string | null;
  kind?: DialplanRuleKind;
  matchType?: DialplanRuleMatchType;
  pattern?: string;
  priority?: number;
  context?: string | null;
  extension?: string | null;
  enabled?: boolean;
  inheritDefault?: boolean;
  recordingEnabled?: boolean;
  stopOnMatch?: boolean;
  actions?: DialplanActionInput[];
}

export interface MatchedDialplanRule {
  rule: DialplanRuleEntity;
  actions: Array<{ app: string; data?: string | undefined }>;
  context: string;
  extensionName: string;
}

@Injectable()
export class DialplanConfigService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(DialplanRuleEntity) private readonly ruleRepo: Repository<DialplanRuleEntity>,
    @InjectRepository(DialplanActionEntity) private readonly actionRepo: Repository<DialplanActionEntity>,
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
  ) {}

  async listRules(tenantId?: string): Promise<DialplanRuleEntity[]> {
    const where: FindOptionsWhere<DialplanRuleEntity> | FindOptionsWhere<DialplanRuleEntity>[] | undefined = tenantId
      ? { tenantId }
      : undefined;
    return this.ruleRepo.find({
      where,
      order: { priority: 'ASC', createdAt: 'ASC' },
      relations: ['tenant'],
    });
  }

  async createRule(input: DialplanRuleInput): Promise<DialplanRuleEntity> {
    const tenantId = input.tenantId?.trim();
    if (!tenantId) {
      throw new BadRequestException('tenantId là bắt buộc');
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) {
      throw new BadRequestException('Tenant không tồn tại');
    }

    const rule = this.ruleRepo.create({
      tenantId: tenant.id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      kind: this.normalizeKind(input.kind),
      matchType: this.normalizeMatchType(input.matchType),
      pattern: (input.pattern ?? '').trim(),
      context: input.context?.trim() || null,
      extension: input.extension?.trim() || null,
      priority: input.priority ?? 0,
      enabled: input.enabled !== undefined ? Boolean(input.enabled) : true,
      inheritDefault: input.inheritDefault !== undefined ? Boolean(input.inheritDefault) : true,
      recordingEnabled: input.recordingEnabled !== undefined ? Boolean(input.recordingEnabled) : true,
      stopOnMatch: input.stopOnMatch !== undefined ? Boolean(input.stopOnMatch) : true,
    });

    const actions = this.normalizeActions(input.actions || []);

    return this.dataSource.transaction(async (manager) => {
      const savedRule = await manager.getRepository(DialplanRuleEntity).save(rule);
      if (actions.length > 0) {
        const actionRepo = manager.getRepository(DialplanActionEntity);
        const actionEntities = actions.map((action) =>
          actionRepo.create({
            ruleId: savedRule.id,
            application: action.application,
            data: action.data ?? null,
            position: action.position ?? 0,
          }),
        );
        await actionRepo.save(actionEntities);
        savedRule.actions = await actionRepo.find({ where: { ruleId: savedRule.id }, order: { position: 'ASC', createdAt: 'ASC' } });
      } else {
        savedRule.actions = [];
      }
      savedRule.tenant = tenant;
      return savedRule;
    });
  }

  async updateRule(id: string, input: DialplanRuleInput): Promise<DialplanRuleEntity> {
    const rule = await this.ruleRepo.findOne({ where: { id } });
    if (!rule) {
      throw new NotFoundException('Dialplan rule không tồn tại');
    }

    let tenantForRule: TenantEntity | null = null;
    if (input.tenantId && input.tenantId !== rule.tenantId) {
      const tenant = await this.tenantRepo.findOne({ where: { id: input.tenantId } });
      if (!tenant) {
        throw new BadRequestException('Tenant không tồn tại');
      }
      rule.tenantId = tenant.id;
      tenantForRule = tenant;
    }

    if (input.name !== undefined) {
      rule.name = input.name.trim();
    }
    if (input.description !== undefined) {
      rule.description = input.description?.trim() || null;
    }
    if (input.kind !== undefined) {
      rule.kind = this.normalizeKind(input.kind);
    }
    if (input.matchType !== undefined) {
      rule.matchType = this.normalizeMatchType(input.matchType);
    }
    if (input.pattern !== undefined) {
      rule.pattern = input.pattern.trim();
    }
    if (input.context !== undefined) {
      rule.context = input.context.trim() ? input.context.trim() : null;
    }
    if (input.extension !== undefined) {
      rule.extension = input.extension.trim() ? input.extension.trim() : null;
    }
    if (input.priority !== undefined) {
      rule.priority = input.priority;
    }
    if (input.enabled !== undefined) {
      rule.enabled = Boolean(input.enabled);
    }
    if (input.inheritDefault !== undefined) {
      rule.inheritDefault = Boolean(input.inheritDefault);
    }
    if (input.recordingEnabled !== undefined) {
      rule.recordingEnabled = Boolean(input.recordingEnabled);
    }
    if (input.stopOnMatch !== undefined) {
      rule.stopOnMatch = Boolean(input.stopOnMatch);
    }

    const actions = input.actions ? this.normalizeActions(input.actions) : null;

    return this.dataSource.transaction(async (manager) => {
      const ruleRepo = manager.getRepository(DialplanRuleEntity);
      const savedRule = await ruleRepo.save(rule);

      if (actions) {
        const actionRepo = manager.getRepository(DialplanActionEntity);
        await actionRepo.delete({ ruleId: savedRule.id });
        if (actions.length > 0) {
          const actionEntities = actions.map((action) =>
            actionRepo.create({
              ruleId: savedRule.id,
              application: action.application,
              data: action.data ?? null,
              position: action.position ?? 0,
            }),
          );
          await actionRepo.save(actionEntities);
        }
        savedRule.actions = await actionRepo.find({ where: { ruleId: savedRule.id }, order: { position: 'ASC', createdAt: 'ASC' } });
      } else {
        savedRule.actions = await manager.getRepository(DialplanActionEntity).find({
          where: { ruleId: savedRule.id },
          order: { position: 'ASC', createdAt: 'ASC' },
        });
      }

      if (!tenantForRule) {
        tenantForRule = await manager.getRepository(TenantEntity).findOne({ where: { id: savedRule.tenantId } }) ?? null;
      }
      if (tenantForRule) {
        savedRule.tenant = tenantForRule;
      }

      return savedRule;
    });
  }

  async deleteRule(id: string): Promise<void> {
    const existing = await this.ruleRepo.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Dialplan rule không tồn tại');
    }
    await this.ruleRepo.delete({ id });
  }

  async resolveForDestination(args: {
    tenantId: string;
    destination: string;
    context?: string;
    domain?: string;
  }): Promise<MatchedDialplanRule | null> {
    const rules = await this.ruleRepo.find({
      where: { tenantId: args.tenantId, enabled: true },
      order: { priority: 'ASC', createdAt: 'ASC' },
    });

    const variables = this.buildTemplateVariables(args);

    for (const rule of rules) {
      if (rule.context && args.context && rule.context !== args.context) {
        continue;
      }
      if (!this.matches(rule, args.destination)) {
        continue;
      }
      const actions = this.renderActions(rule, variables);
      const extensionName = rule.extension?.trim()
        ? this.applyTemplate(rule.extension, variables)
        : `rule_${rule.id}`;
      const context = rule.context?.trim() || args.context || `context_${args.tenantId}`;
      return {
        rule,
        actions,
        context,
        extensionName,
      };
    }
    return null;
  }

  sanitizeRule(rule: DialplanRuleEntity) {
    const sortedActions = [...(rule.actions || [])].sort((a, b) => {
      if (a.position === b.position) {
        const aCreated = a.createdAt?.valueOf?.() ?? 0;
        const bCreated = b.createdAt?.valueOf?.() ?? 0;
        return aCreated - bCreated;
      }
      return (a.position ?? 0) - (b.position ?? 0);
    });

    return {
      id: rule.id,
      tenantId: rule.tenantId,
      tenantName: rule.tenant?.name || undefined,
      kind: rule.kind,
      name: rule.name,
      description: rule.description,
      matchType: rule.matchType,
      pattern: rule.pattern,
      context: rule.context,
      extension: rule.extension,
      priority: rule.priority,
      enabled: rule.enabled,
      inheritDefault: rule.inheritDefault,
      recordingEnabled: rule.recordingEnabled,
      stopOnMatch: rule.stopOnMatch,
      actions: sortedActions.map((action) => ({
        id: action.id,
        application: action.application,
        data: action.data,
        position: action.position,
      })),
      createdAt: rule.createdAt?.toISOString?.() ?? undefined,
      updatedAt: rule.updatedAt?.toISOString?.() ?? undefined,
    };
  }

  private normalizeActions(actions: DialplanActionInput[]): DialplanActionInput[] {
    return actions
      .map((action, index) => ({
        position: action.position ?? index * 10,
        application: action.application.trim(),
        data: action.data?.trim() || null,
      }))
      .filter((action) => action.application.length > 0);
  }

  private normalizeKind(kind?: DialplanRuleKind): DialplanRuleKind {
    if (kind === 'external') {
      return 'external';
    }
    return 'internal';
  }

  private normalizeMatchType(matchType?: DialplanRuleMatchType): DialplanRuleMatchType {
    if (matchType === 'exact' || matchType === 'prefix') {
      return matchType;
    }
    return 'regex';
  }

  private matches(rule: DialplanRuleEntity, destination: string): boolean {
    const target = destination || '';
    const pattern = rule.pattern || '';
    if (!pattern) {
      return false;
    }

    switch (rule.matchType) {
      case 'exact':
        return target === pattern;
      case 'prefix':
        return target.startsWith(pattern);
      case 'regex':
      default:
        try {
          const regex = new RegExp(pattern);
          return regex.test(target);
        } catch (error) {
          return false;
        }
    }
  }

  private renderActions(rule: DialplanRuleEntity, variables: Record<string, string>): Array<{ app: string; data?: string }> {
    const sortedActions = [...(rule.actions || [])].sort((a, b) => {
      if (a.position === b.position) {
        const aCreated = a.createdAt?.valueOf?.() ?? 0;
        const bCreated = b.createdAt?.valueOf?.() ?? 0;
        return aCreated - bCreated;
      }
      return (a.position ?? 0) - (b.position ?? 0);
    });

    return sortedActions.map((action) => ({
      app: action.application,
      data: action.data ? this.applyTemplate(action.data, variables) : undefined,
    }));
  }

  private applyTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key) => {
      const value = variables[key];
      return value !== undefined ? value : match;
    });
  }

  private buildTemplateVariables(args: { tenantId: string; destination: string; context?: string; domain?: string }): Record<string, string> {
    return {
      tenantId: args.tenantId,
      destination: args.destination,
      domain: args.domain || '',
      context: args.context || '',
      digits: args.destination.replace(/\D/g, ''),
    };
  }
}
