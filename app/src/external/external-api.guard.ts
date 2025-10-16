import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class ExternalApiGuard implements CanActivate {
  private readonly tokens: string[];

  constructor(private readonly configService: ConfigService) {
    const raw = this.configService.get<string>('EXTERNAL_EXTENSIONS_TOKEN') || '';
    this.tokens = raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request) {
      throw new UnauthorizedException('Không thể xác thực yêu cầu');
    }

    if (this.tokens.length === 0) {
      throw new UnauthorizedException('External API token chưa được cấu hình');
    }

    const provided = this.extractToken(request);
    if (!provided) {
      throw new UnauthorizedException('Thiếu API token');
    }

    if (!this.tokens.includes(provided)) {
      throw new UnauthorizedException('API token không hợp lệ');
    }

    return true;
  }

  private extractToken(request: Request): string | null {
    const headerKeys = Object.keys(request.headers);
    for (const key of headerKeys) {
      if (key.toLowerCase() === 'x-api-key') {
        const value = request.headers[key];
        if (Array.isArray(value)) {
          return value[0]?.trim() || null;
        }
        return typeof value === 'string' ? value.trim() || null : null;
      }
    }

    const authorization = request.headers.authorization;
    if (!authorization || typeof authorization !== 'string') {
      return null;
    }

    const normalized = authorization.trim();
    if (normalized.toLowerCase().startsWith('bearer ')) {
      return normalized.slice(7).trim() || null;
    }
    return normalized || null;
  }
}
