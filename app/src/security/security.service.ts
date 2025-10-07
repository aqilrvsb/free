import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AxiosRequestConfig } from 'axios';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  CreateBanPayload,
  CreateFirewallRulePayload,
  ListBansQuery,
  SecurityAgentHealth,
  SecurityAgentInfo,
  SecurityBanRecord,
  SecurityFirewallRule,
  SecurityOverviewResponse,
} from './security.types';

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private readonly agentBaseUrl: string | null;
  private readonly agentToken: string | null;
  private readonly agentTimeout: number;

  private static readonly IPV4_CIDR_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.|$)){4}(?:\/(?:3[0-2]|[12]?\d))?$/;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.agentBaseUrl = (this.config.get<string>('SECURITY_AGENT_URL') || '').trim() || null;
    this.agentToken = (this.config.get<string>('SECURITY_AGENT_TOKEN') || '').trim() || null;
    const timeoutRaw = Number.parseInt(String(this.config.get('SECURITY_AGENT_TIMEOUT_MS', '3000')), 10);
    this.agentTimeout = Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 3000;
  }

  async getOverview(): Promise<SecurityOverviewResponse> {
    const fallback: SecurityOverviewResponse = {
      agent: {
        connected: false,
        lastCheckedAt: new Date().toISOString(),
      },
      summary: {},
    };

    if (!this.agentBaseUrl) {
      return fallback;
    }

    try {
      const data = await this.requestAgent<SecurityOverviewResponse>({
        method: 'GET',
        url: '/status',
      });
      if (!data || typeof data !== 'object') {
        return fallback;
      }
      return {
        agent: this.normalizeAgentHealth(data.agent),
        summary: this.normalizeAgentInfo(data.summary),
      };
    } catch (error) {
      this.logAgentError('GET /status', error);
      return fallback;
    }
  }

  async listBans(query: ListBansQuery = {}): Promise<SecurityBanRecord[]> {
    if (!this.agentBaseUrl) {
      return [];
    }

    const params: Record<string, string | number> = {};
    if (query.jail) {
      params.jail = query.jail;
    }
    if (typeof query.limit === 'number' && Number.isFinite(query.limit) && query.limit > 0) {
      params.limit = Math.min(Math.floor(query.limit), 500);
    }

    try {
      const bans = await this.requestAgent<SecurityBanRecord[]>({
        method: 'GET',
        url: '/bans',
        params,
      });
      return Array.isArray(bans) ? bans : [];
    } catch (error) {
      this.handleMutationError('Không thể tải danh sách IP bị chặn', error);
    }
  }

  async createBan(payload: CreateBanPayload): Promise<SecurityBanRecord> {
    if (!this.agentBaseUrl) {
      throw new BadRequestException('Security agent chưa được cấu hình');
    }

    const ip = payload.ip?.trim();
    if (!ip || !SecurityService.IPV4_CIDR_REGEX.test(ip)) {
      throw new BadRequestException('IP hoặc CIDR không hợp lệ');
    }

    const durationSeconds = payload.durationSeconds;
    if (typeof durationSeconds === 'number' && (!Number.isFinite(durationSeconds) || durationSeconds < 0)) {
      throw new BadRequestException('Thời gian ban phải lớn hơn hoặc bằng 0');
    }

    try {
      const created = await this.requestAgent<SecurityBanRecord>({
        method: 'POST',
        url: '/bans',
        data: {
          ip,
          jail: payload.jail?.trim() || undefined,
          durationSeconds,
          reason: payload.reason?.trim() || undefined,
        },
      });
      return created;
    } catch (error) {
      this.handleMutationError('Không thể thêm IP vào danh sách ban', error);
    }
  }

  async deleteBan(idOrIp: string, jail?: string): Promise<{ success: boolean }> {
    if (!this.agentBaseUrl) {
      throw new BadRequestException('Security agent chưa được cấu hình');
    }
    const identifier = encodeURIComponent(idOrIp);
    try {
      await this.requestAgent({
        method: 'DELETE',
        url: `/bans/${identifier}`,
        params: jail ? { jail } : undefined,
      });
      return { success: true };
    } catch (error) {
      this.handleMutationError('Không thể gỡ IP khỏi danh sách ban', error);
    }
  }

  async listFirewallRules(): Promise<SecurityFirewallRule[]> {
    if (!this.agentBaseUrl) {
      return [];
    }

    try {
      const rules = await this.requestAgent<SecurityFirewallRule[]>({
        method: 'GET',
        url: '/firewall/rules',
      });
      return Array.isArray(rules) ? rules : [];
    } catch (error) {
      this.handleMutationError('Không thể tải danh sách rule firewall', error);
    }
  }

  async createFirewallRule(payload: CreateFirewallRulePayload): Promise<SecurityFirewallRule> {
    if (!this.agentBaseUrl) {
      throw new BadRequestException('Security agent chưa được cấu hình');
    }

    const action = payload.action?.trim();
    if (!action) {
      throw new BadRequestException('Thiếu action cho rule firewall');
    }

    try {
      return await this.requestAgent<SecurityFirewallRule>({
        method: 'POST',
        url: '/firewall/rules',
        data: {
          action,
          source: payload.source?.trim() || undefined,
          destination: payload.destination?.trim() || undefined,
          protocol: payload.protocol?.trim() || undefined,
          port: payload.port?.trim() || undefined,
          description: payload.description?.trim() || undefined,
          table: payload.table?.trim() || undefined,
          chain: payload.chain?.trim() || undefined,
        },
      });
    } catch (error) {
      this.handleMutationError('Không thể tạo rule firewall', error);
    }
  }

  async deleteFirewallRule(ruleId: string): Promise<{ success: boolean }> {
    if (!this.agentBaseUrl) {
      throw new BadRequestException('Security agent chưa được cấu hình');
    }

    if (!ruleId) {
      throw new BadRequestException('Thiếu mã rule');
    }

    try {
      await this.requestAgent({
        method: 'DELETE',
        url: `/firewall/rules/${encodeURIComponent(ruleId)}`,
      });
      return { success: true };
    } catch (error) {
      this.handleMutationError('Không thể xóa rule firewall', error);
    }
  }

  private normalizeAgentHealth(health?: SecurityAgentHealth | null): SecurityAgentHealth {
    if (!health || typeof health !== 'object') {
      return {
        connected: false,
        lastCheckedAt: new Date().toISOString(),
      };
    }
    return {
      connected: Boolean(health.connected),
      lastCheckedAt: health.lastCheckedAt || new Date().toISOString(),
    };
  }

  private normalizeAgentInfo(info?: SecurityAgentInfo | null): SecurityAgentInfo {
    if (!info || typeof info !== 'object') {
      return {};
    }

    const result: SecurityAgentInfo = {};
    if (info.fail2ban) {
      result.fail2ban = {
        version: typeof info.fail2ban.version === 'string' ? info.fail2ban.version : undefined,
        uptimeSeconds: Number.isFinite(info.fail2ban.uptimeSeconds)
          ? Number(info.fail2ban.uptimeSeconds)
          : undefined,
        running: Boolean(info.fail2ban.running),
        jails: Array.isArray(info.fail2ban.jails) ? info.fail2ban.jails : [],
      };
    }

    if (info.firewall) {
      result.firewall = {
        backend: typeof info.firewall.backend === 'string' ? info.firewall.backend : undefined,
        defaultPolicy: typeof info.firewall.defaultPolicy === 'string' ? info.firewall.defaultPolicy : undefined,
        rulesCount: Number.isFinite(info.firewall.rulesCount)
          ? Number(info.firewall.rulesCount)
          : undefined,
        updatedAt: typeof info.firewall.updatedAt === 'string' ? info.firewall.updatedAt : undefined,
      };
    }

    return result;
  }

  private async requestAgent<T>(config: AxiosRequestConfig): Promise<T> {
    if (!this.agentBaseUrl) {
      throw new ServiceUnavailableException('Security agent chưa được cấu hình');
    }

    const baseConfig: AxiosRequestConfig = {
      baseURL: this.agentBaseUrl,
      timeout: this.agentTimeout,
      headers: {
        Accept: 'application/json',
      },
      validateStatus: (status) => status >= 200 && status < 300,
      ...config,
    };

    if (this.agentToken) {
      baseConfig.headers = {
        ...baseConfig.headers,
        Authorization: `Bearer ${this.agentToken}`,
      };
    }

    try {
      const response = await firstValueFrom(this.http.request<T>(baseConfig));
      return response.data;
    } catch (error) {
      throw this.wrapAgentError(error);
    }
  }

  private wrapAgentError(error: unknown): ServiceUnavailableException | BadRequestException {
    if (error instanceof BadRequestException || error instanceof ServiceUnavailableException) {
      return error;
    }

    if (error instanceof AxiosError) {
      const status = error.response?.status;
      if (status && status >= 400 && status < 500) {
        const message = this.extractMessage(error) || 'Yêu cầu tới security agent bị từ chối';
        return new BadRequestException(message);
      }
      const message = this.extractMessage(error) || 'Security agent không phản hồi';
      return new ServiceUnavailableException(message);
    }

    const generic = error instanceof Error ? error.message : String(error);
    return new ServiceUnavailableException(`Security agent lỗi: ${generic}`);
  }

  private extractMessage(error: AxiosError): string | null {
    const data = error.response?.data as Record<string, unknown> | undefined;
    if (data) {
      if (typeof data === 'string') {
        return data;
      }
      if (typeof data.message === 'string') {
        return data.message;
      }
      if (Array.isArray(data.message) && typeof data.message[0] === 'string') {
        return data.message[0];
      }
    }
    if (error.message) {
      return error.message;
    }
    return null;
  }

  private handleMutationError(defaultMessage: string, error: unknown): never {
    const wrapped = this.wrapAgentError(error);
    if (wrapped instanceof ServiceUnavailableException) {
      this.logger.warn(`${defaultMessage}: ${wrapped.message}`);
      throw new ServiceUnavailableException(defaultMessage);
    }
    if (wrapped instanceof BadRequestException) {
      throw wrapped;
    }
    throw wrapped;
  }

  private logAgentError(operation: string, error: unknown): void {
    const wrapped = this.wrapAgentError(error);
    this.logger.warn(`[Security] ${operation} failed: ${wrapped.message}`);
  }
}
