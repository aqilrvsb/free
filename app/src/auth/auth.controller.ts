import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { Request } from 'express';
import { SwaggerTags } from '../swagger/swagger-tags';
import { LoginRequestDto } from './dto/login-request.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutRequestDto } from './dto/logout-request.dto';

@ApiTags(SwaggerTags.Auth)
@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/auth/login')
  async login(@Body() body: LoginRequestDto) {
    const email = body.email?.trim().toLowerCase() || '';
    const password = body.password || '';
    return this.authService.login(email, password);
  }

  @Post('/auth/refresh')
  async refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('/auth/logout')
  async logout(@Body() body: LogoutRequestDto) {
    await this.authService.logout(body.refreshToken ?? null);
    return { success: true };
  }

  @Get('/auth/profile')
  @ApiBearerAuth('jwt')
  @UseGuards(JwtAuthGuard)
  async profile(@Req() req: Request & { user?: any }) {
    const user = req.user;
    if (!user) {
      return null;
    }
    return this.authService.getProfile(user.id || user.sub);
  }
}
