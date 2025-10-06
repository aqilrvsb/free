import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { IvrMenuEntity, IvrMenuOptionEntity, TenantEntity } from '../entities';

export interface IvrMenuOptionDto {
  id?: string;
  digit: string;
  description?: string;
  actionType: 'extension' | 'sip_uri' | 'voicemail' | 'hangup';
  actionValue?: string | null;
  position?: number;
}

export interface CreateIvrMenuDto {
  tenantId: string;
  name: string;
  description?: string;
  greetingAudioUrl?: string;
  invalidAudioUrl?: string;
  timeoutSeconds?: number;
  maxRetries?: number;
  options: IvrMenuOptionDto[];
}

export type UpdateIvrMenuDto = Partial<CreateIvrMenuDto>;

@Injectable()
export class IvrMenuService {
  constructor(
    @InjectRepository(IvrMenuEntity) private readonly menuRepo: Repository<IvrMenuEntity>,
    @InjectRepository(IvrMenuOptionEntity) private readonly optionRepo: Repository<IvrMenuOptionEntity>,
    @InjectRepository(TenantEntity) private readonly tenantRepo: Repository<TenantEntity>,
  ) {}

  async listMenus(tenantId?: string) {
    const where = tenantId ? { tenantId } : {};
    const menus = await this.menuRepo.find({ where, relations: ['tenant', 'options'], order: { createdAt: 'ASC' } });
    return menus.map((menu) => this.sanitize(menu));
  }

  async getMenu(id: string) {
    const menu = await this.menuRepo.findOne({ where: { id }, relations: ['tenant', 'options'] });
    if (!menu) {
      throw new NotFoundException('IVR menu không tồn tại');
    }
    return this.sanitize(menu);
  }

  async createMenu(dto: CreateIvrMenuDto) {
    const tenant = await this.tenantRepo.findOne({ where: { id: dto.tenantId.trim() } });
    if (!tenant) {
      throw new BadRequestException('Tenant không tồn tại');
    }

    const options = this.prepareOptions(dto.options);

    const menu = this.menuRepo.create({
      tenantId: tenant.id,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      greetingAudioUrl: dto.greetingAudioUrl?.trim() || null,
      invalidAudioUrl: dto.invalidAudioUrl?.trim() || null,
      timeoutSeconds: dto.timeoutSeconds !== undefined ? this.normalizePositiveInt(dto.timeoutSeconds, 5) : 5,
      maxRetries: dto.maxRetries !== undefined ? this.normalizePositiveInt(dto.maxRetries, 3) : 3,
      options,
    });

    const saved = await this.menuRepo.save(menu);
    return this.getMenu(saved.id);
  }

  async updateMenu(id: string, dto: UpdateIvrMenuDto) {
    const menu = await this.menuRepo.findOne({ where: { id } });
    if (!menu) {
      throw new NotFoundException('IVR menu không tồn tại');
    }

    if (dto.tenantId && dto.tenantId !== menu.tenantId) {
      const tenant = await this.tenantRepo.findOne({ where: { id: dto.tenantId } });
      if (!tenant) {
        throw new BadRequestException('Tenant không tồn tại');
      }
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
    if (dto.timeoutSeconds !== undefined) {
      menu.timeoutSeconds = this.normalizePositiveInt(dto.timeoutSeconds, 5);
    }
    if (dto.maxRetries !== undefined) {
      menu.maxRetries = this.normalizePositiveInt(dto.maxRetries, 3);
    }

    if (dto.options !== undefined) {
      const options = this.prepareOptions(dto.options);
      await this.optionRepo.delete({ menuId: menu.id });
      menu.options = options;
    }

    await this.menuRepo.save(menu);
    return this.getMenu(menu.id);
  }

  async deleteMenu(id: string): Promise<void> {
    const menu = await this.menuRepo.findOne({ where: { id } });
    if (!menu) {
      throw new NotFoundException('IVR menu không tồn tại');
    }
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
      timeoutSeconds: menu.timeoutSeconds,
      maxRetries: menu.maxRetries,
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
      if (!['extension', 'sip_uri', 'voicemail', 'hangup'].includes(actionType)) {
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

  private normalizePositiveInt(value: number, fallback: number): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    const parsed = Math.max(1, Math.floor(Number(value)));
    return parsed;
  }
}
