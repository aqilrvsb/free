import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PortalUsersService } from './portal-users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly portalUsersService: PortalUsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.portalUsersService.validateCredentials(email, password);
    if (!user) {
      throw new UnauthorizedException('Thông tin đăng nhập không hợp lệ');
    }

    await this.portalUsersService.markLogin(user.id);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.roleKey,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    return {
      accessToken,
      user: this.portalUsersService.sanitizeUser(user),
    };
  }

  async getProfile(userId: string) {
    return this.portalUsersService.getUser(userId);
  }
}
