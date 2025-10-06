import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PortalUsersService } from '../portal/portal-users.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly portalUsersService: PortalUsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('PORTAL_JWT_SECRET', 'change-me'),
    });
  }

  async validate(payload: JwtPayload) {
    try {
      const user = await this.portalUsersService.getUser(payload.sub);
      return user;
    } catch (error) {
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }
  }
}
