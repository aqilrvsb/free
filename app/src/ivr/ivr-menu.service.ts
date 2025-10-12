import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IvrMenuEntity, IvrMenuOptionEntity, TenantEntity } from '../entities';

const SUPPORTED_ACTION_TYPES = ['extension', 'sip_uri', 'voicemail', 'hangup'] as const;
type SupportedActionType = (typeof SUPPORTED_ACTION_TYPES)[number];

export interface IvrMenuOptionDto {
  id?: string;
  digit: string;
  description?: string;
  actionType: SupportedActionType;
  actionValue?: string | null;
  position?: number;
}

export interface CreateIvrMenuDto {
  tenantId: string;
  name: string;
  description?: string;
  greetingAudioUrl?: string;
  invalidAudioUrl?: string;
  invalidActionType?: SupportedActionType | null;
  invalidActionValue?: string | null;
  timeoutSeconds?: number;
  maxRetries?: number;
  timeoutActionType?: SupportedActionType | null;
  timeoutActionValue?: string | null;
  options: IvrMenuOptionDto[];
}

export type UpdateIvrMenuDto = Partial<CreateIvrMenuDto>;

interface RoutingScope {
  isSuperAdmin: boolean;
  tenantIds: string[];
}

@Injectable()
export class IvrMenuService {
  constructor(
    @InjectRepository(IvrMenuEntity) private readonly menuRepo: Repository<IvrMenuEntity>,
    @InjectRepository(IvrMenuOptionEntity) private readonly optionRepo: Repository<IvrMenuOptionEntity>,
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
  ) {}

  async listMenus(tenantId?: string, scope?: RoutingScope) {
    const normalizedTenantId = tenantId?.trim();
    let where: any = {};

    if (!scope || scope.isSuperAdmin) {
      where = normalizedTenantId ? { tenantId: normalizedTenantId } : {};
    } else {
      const allowed = Array.from(new Set(scope.tenantIds));
      if (normalizedTenantId) {
        if (!allowed.includes(normalizedTenantId)) {
          return [];
        }
        where = { tenantId: normalizedTenantId };
      } else {
        if (!allowed.length) {
          return [];
        }
        where = { tenantId: In(allowed) };
      }
    }

    const menus = await this.menuRepo.find({ where, relations: ['tenant', 'options'], order: { createdAt: 'ASC' } });
    return menus.map((menu) => this.sanitize(menu));
  }

  async getMenu(id: string, scope?: RoutingScope) {
    const menu = await this.menuRepo.findOne({ where: { id }, relations: ['tenant', 'options'] });
    if (!menu) {
      throw new NotFoundException('IVR menu không tồn tại');
    }
    this.ensureTenantAccess(scope, menu.tenantId);
    return this.sanitize(menu);
  }

  async createMenu(dto: CreateIvrMenuDto, scope?: RoutingScope) {
    const tenant = await this.tenantRepo.findOne({ where: { id: dto.tenantId.trim() } });
    if (!tenant) {
      throw new BadRequestException('Tenant không tồn tại');
    }

    this.ensureTenantAccess(scope, tenant.id);

    const options = this.prepareOptions(dto.options);
    const invalidAction = this.normalizeMenuAction(dto.invalidActionType, dto.invalidActionValue);
    const timeoutAction = this.normalizeMenuAction(dto.timeoutActionType, dto.timeoutActionValue);

    const menu = this.menuRepo.create({
      tenantId: tenant.id,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      greetingAudioUrl: dto.greetingAudioUrl?.trim() || null,
      invalidAudioUrl: dto.invalidAudioUrl?.trim() || null,
      invalidActionType: invalidAction?.actionType ?? null,
      invalidActionValue: invalidAction?.actionValue ?? null,
      timeoutSeconds: dto.timeoutSeconds !== undefined ? this.normalizePositiveInt(dto.timeoutSeconds, 5) : 5,
      maxRetries: dto.maxRetries !== undefined ? this.normalizePositiveInt(dto.maxRetries, 3) : 3,
      timeoutActionType: timeoutAction?.actionType ?? null,
      timeoutActionValue: timeoutAction?.actionValue ?? null,
      options,
    });

    const saved = await this.menuRepo.save(menu);
    return this.getMenu(saved.id, scope);
  }

  async updateMenu(id: string, dto: UpdateIvrMenuDto, scope?: RoutingScope) {
    const menu = await this.menuRepo.findOne({ where: { id } });
    if (!menu) {
      throw new NotFoundException('IVR menu không tồn tại');
    }

    this.ensureTenantAccess(scope, menu.tenantId);

    if (dto.tenantId && dto.tenantId !== menu.tenantId) {
      const tenant = await this.tenantRepo.findOne({ where: { id: dto.tenantId } });
      if (!tenant) {
        throw new BadRequestException('Tenant không tồn tại');
      }
      this.ensureTenantAccess(scope, tenant.id);
      menu.tenantId = tenant.id;
    }

    if (dto.name !== undefined) {
      menu.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      menu.description = dto.description.trim() ? dto.description.trim() : null;
    }
    if (dto.greetingAudioUrl !== undefined) {
      menu.greetingAudioUrl = dto.greetingAudioUrl.trim() ? dto.greetingAudioUrl.trim() : null;
    }
    if (dto.invalidAudioUrl !== undefined) {
      menu.invalidAudioUrl = dto.invalidAudioUrl.trim() ? dto.invalidAudioUrl.trim() : null;
    }
    if (dto.invalidActionType !== undefined || dto.invalidActionValue !== undefined) {
      const normalized = this.normalizeMenuAction(dto.invalidActionType ?? null, dto.invalidActionValue);
      menu.invalidActionType = normalized?.actionType ?? null;
      menu.invalidActionValue = normalized?.actionValue ?? null;
    }
    if (dto.timeoutSeconds !== undefined) {
      menu.timeoutSeconds = this.normalizePositiveInt(dto.timeoutSeconds, 5);
    }
    if (dto.maxRetries !== undefined) {
      menu.maxRetries = this.normalizePositiveInt(dto.maxRetries, 3);
    }
    if (dto.timeoutActionType !== undefined || dto.timeoutActionValue !== undefined) {
      const normalized = this.normalizeMenuAction(dto.timeoutActionType ?? null, dto.timeoutActionValue);
      menu.timeoutActionType = normalized?.actionType ?? null;
      menu.timeoutActionValue = normalized?.actionValue ?? null;
    }

    if (dto.options !== undefined) {
      const options = this.prepareOptions(dto.options);
      await this.optionRepo.delete({ menuId: menu.id });
      menu.options = options;
    }

    await this.menuRepo.save(menu);
    return this.getMenu(menu.id, scope);
  }

  async deleteMenu(id: string, scope?: RoutingScope): Promise<void> {
    const menu = await this.menuRepo.findOne({ where: { id } });
    if (!menu) {
      throw new NotFoundException('IVR menu không tồn tại');
    }
    this.ensureTenantAccess(scope, menu.tenantId);
    await this.menuRepo.delete({ id });
  }

  private sanitize(menu: IvrMenuEntity) {
    const sortedOptions = [...(menu.options || [])].sort((a, b) => {
      if (a.position !== b.position) {
        return a.position - b.position;
      }
      return a.digit.localeCompare(b.digit);
    });

    return {
      id: menu.id,
      tenantId: menu.tenantId,
      tenantName: menu.tenant?.name,
      name: menu.name,
      description: menu.description,
      greetingAudioUrl: menu.greetingAudioUrl,
      invalidAudioUrl: menu.invalidAudioUrl,
      invalidActionType: menu.invalidActionType,
      invalidActionValue: menu.invalidActionValue,
      timeoutSeconds: menu.timeoutSeconds,
      maxRetries: menu.maxRetries,
      timeoutActionType: menu.timeoutActionType,
      timeoutActionValue: menu.timeoutActionValue,
      options: sortedOptions.map((option) => ({
        id: option.id,
        digit: option.digit,
        description: option.description,
        actionType: option.actionType,
        actionValue: option.actionValue,
        position: option.position,
      })),
      createdAt: menu.createdAt,
      updatedAt: menu.updatedAt,
    };
  }

  private prepareOptions(options: IvrMenuOptionDto[]): IvrMenuOptionEntity[] {
    if (!Array.isArray(options) || options.length === 0) {
      throw new BadRequestException('Vui lòng cấu hình ít nhất một lựa chọn IVR');
    }

    const normalizedDigits = new Set<string>();
    return options.map((option, index) => {
      const digit = (option.digit || '').trim();
      if (!digit) {
        throw new BadRequestException('Lựa chọn IVR phải có phím bấm');
      }
      if (!/^[0-9#*]{1}$/.test(digit)) {
        throw new BadRequestException('Phím bấm chỉ hỗ trợ 0-9, *, #');
      }
      if (normalizedDigits.has(digit)) {
        throw new BadRequestException(`Phím ${digit} đã được sử dụng`);
      }
      normalizedDigits.add(digit);

      const actionType = option.actionType;
      if (!SUPPORTED_ACTION_TYPES.includes(actionType)) {
        throw new BadRequestException(`Hành động không hợp lệ: ${actionType}`);
      }

      let actionValue = (option.actionValue || '').trim();
      if (actionType === 'hangup') {
        actionValue = '';
      } else if (!actionValue) {
        throw new BadRequestException(`Vui lòng nhập giá trị cho hành động ${actionType}`);
      }

      const entity = this.optionRepo.create({
        digit,
        description: option.description?.trim() || null,
        actionType: actionType as IvrMenuOptionEntity['actionType'],
        actionValue: actionValue || null,
        position: option.position !== undefined ? option.position : index * 10,
      });

      return entity;
    });
  }

  private normalizeMenuAction(
    actionTypeRaw: SupportedActionType | string | null | undefined,
    actionValueRaw: string | null | undefined,
  ): { actionType: IvrMenuOptionEntity['actionType']; actionValue: string | null } | null {
    const normalizedType = actionTypeRaw === undefined || actionTypeRaw === null ? '' : String(actionTypeRaw).trim();
    if (!normalizedType) {
      return null;
    }

    if (!SUPPORTED_ACTION_TYPES.includes(normalizedType as SupportedActionType)) {
      throw new BadRequestException(`Hành động không hợp lệ: ${actionTypeRaw}`);
    }

    const actionType = normalizedType as IvrMenuOptionEntity['actionType'];
    if (actionType === 'hangup') {
      return { actionType, actionValue: null };
    }

    const actionValue = (actionValueRaw || '').trim();
    if (!actionValue) {
      throw new BadRequestException(`Vui lòng nhập giá trị cho hành động ${actionType}`);
    }

    return { actionType, actionValue };
  }

  private normalizePositiveInt(value: number, fallback: number): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    const parsed = Math.max(1, Math.floor(Number(value)));
    return parsed;
  }

  private ensureTenantAccess(scope: RoutingScope | undefined, tenantId: string): void {
    if (!scope || scope.isSuperAdmin) {
      return;
    }
    if (!scope.tenantIds.includes(tenantId)) {
      throw new ForbiddenException('Không có quyền thao tác trên tenant này');
    }
  }
}
