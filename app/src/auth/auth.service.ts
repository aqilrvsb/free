import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PortalUsersService } from '../portal/portal-users.service';
import { PortalUserEntity } from '../entities';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly portalUsersService: PortalUsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.accessTokenTtlSeconds = this.parseDurationToSeconds(
      this.configService.get<string | number>('PORTAL_JWT_EXPIRES', '1h'),
      60 * 60,
    );
    this.refreshTokenTtlSeconds = this.parseDurationToSeconds(
      this.configService.get<string | number>('PORTAL_REFRESH_EXPIRES', '7d'),
      60 * 60 * 24 * 7,
    );
  }

  private readonly accessTokenTtlSeconds: number;
  private readonly refreshTokenTtlSeconds: number;

  async login(email: string, password: string) {
    const user = await this.portalUsersService.validateCredentials(email, password);
    if (!user) {
      throw new UnauthorizedException('Thông tin đăng nhập không hợp lệ');
    }

    await this.portalUsersService.markLogin(user.id);

    return this.issueTokenBundle(user);
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }

    const { userId, tokenId } = this.parseRefreshToken(refreshToken);
    const rawUser = await this.portalUsersService.verifyRefreshToken(userId, tokenId);
    if (!rawUser) {
      throw new UnauthorizedException('Refresh token đã hết hạn hoặc không hợp lệ');
    }
    return this.issueTokenBundle(rawUser);
  }

  async getProfile(userId: string) {
    return this.portalUsersService.getUser(userId);
  }

  async logout(refreshToken: string | null | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    try {
      const { userId, tokenId } = this.parseRefreshToken(refreshToken);
      await this.portalUsersService.clearRefreshToken(userId, tokenId);
    } catch {
      // ignore invalid token at logout
    }
  }

  private async issueTokenBundle(user: PortalUserEntity) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.roleKey,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.accessTokenTtlSeconds,
    });

    const { value: refreshToken, tokenId, expiresAt } = this.generateRefreshToken(user.id);
    await this.portalUsersService.updateRefreshToken(user.id, tokenId, expiresAt);

    const sanitized = await this.portalUsersService.getUser(user.id);
    return {
      accessToken,
      accessTokenExpiresIn: this.accessTokenTtlSeconds,
      refreshToken,
      refreshTokenExpiresIn: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      user: sanitized,
    };
  }

  private generateRefreshToken(userId: string): { value: string; tokenId: string; expiresAt: Date } {
    const tokenId = randomBytes(32).toString('hex');
    const value = `${userId}.${tokenId}`;
    const expiresAt = new Date(Date.now() + this.refreshTokenTtlSeconds * 1000);
    return { value, tokenId, expiresAt };
  }

  private parseRefreshToken(refreshToken: string): { userId: string; tokenId: string } {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
    const parts = refreshToken.split('.');
    if (parts.length !== 2) {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
    const [userId, tokenId] = parts;
    if (!userId || !tokenId) {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
    return { userId, tokenId };
  }

  private parseDurationToSeconds(input: string | number | undefined, fallbackSeconds: number): number {
    if (typeof input === 'number' && Number.isFinite(input) && input > 0) {
      return Math.floor(input);
    }
    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) {
        return fallbackSeconds;
      }
      const direct = Number(trimmed);
      if (Number.isFinite(direct) && direct > 0) {
        return Math.floor(direct);
      }
      const match = /^(\d+)\s*([smhd])$/i.exec(trimmed);
      if (match) {
        const value = Number(match[1]);
        if (!Number.isFinite(value) || value <= 0) {
          return fallbackSeconds;
        }
        const unit = match[2].toLowerCase();
        switch (unit) {
          case 's':
            return value;
          case 'm':
            return value * 60;
          case 'h':
            return value * 60 * 60;
          case 'd':
            return value * 60 * 60 * 24;
          default:
            return fallbackSeconds;
        }
      }
    }
    return fallbackSeconds;
  }
}
