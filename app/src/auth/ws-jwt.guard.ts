import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { PortalUsersService } from '../portal/portal-users.service';

interface JwtPayload {
  sub: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly portalUsersService: PortalUsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient<Socket>();
    const token = this.extractToken(client);
    const logger = new Logger(WsJwtGuard.name);
    logger.log(
      `[guard] handshake id=${client.id} hasToken=${Boolean(token)} authKeys=${Object.keys(
        client.handshake.auth || {},
      ).join(',')}`,
    );
    if (!token) {
      throw new WsException('Unauthorized');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      logger.log(`[guard] token payload sub=${payload.sub} role=${payload.role ?? 'n/a'}`);
      const user = await this.portalUsersService.getUser(payload.sub);
      if (!user) {
        throw new WsException('Unauthorized');
      }
      client.data.user = user;
      client.data.tokenPayload = payload;
      logger.log(
        `[guard] resolved user=${typeof user.email === 'string' ? user.email : user.id} tenantIds=${
          Array.isArray(user.tenantIds) ? user.tenantIds.join(',') : 'none'
        }`,
      );
      return true;
    } catch (error) {
      logger.warn(
        `[guard] authorize failed client=${client.id} reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new WsException('Unauthorized');
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim().length > 0) {
      return authToken.trim();
    }

    const headerToken = this.extractBearerToken(
      typeof client.handshake.headers?.authorization === 'string'
        ? client.handshake.headers.authorization
        : undefined,
    );
    if (headerToken) {
      return headerToken;
    }

    const cookieToken = this.extractFromCookies(
      typeof client.handshake.headers?.cookie === 'string'
        ? client.handshake.headers.cookie
        : undefined,
    );
    if (cookieToken) {
      return cookieToken;
    }

    return null;
  }

  private extractBearerToken(authorization?: string): string | null {
    if (!authorization) {
      return null;
    }
    const parts = authorization.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0]) && parts[1].trim().length > 0) {
      return parts[1].trim();
    }
    return null;
  }

  private extractFromCookies(cookieHeader?: string): string | null {
    if (!cookieHeader) {
      return null;
    }
    const segments = cookieHeader.split(';');
    for (const segment of segments) {
      const [rawKey, rawValue] = segment.split('=');
      if (!rawKey || !rawValue) {
        continue;
      }
      const key = rawKey.trim();
      if (key === 'portal_token') {
        try {
          return decodeURIComponent(rawValue.trim());
        } catch {
          return rawValue.trim();
        }
      }
    }
    return null;
  }
}
