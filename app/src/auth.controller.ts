import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { Request } from 'express';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/auth/login')
  async login(
    @Body()
    body: {
      email: string;
      password: string;
    },
  ) {
    const email = body.email?.trim().toLowerCase() || '';
    const password = body.password || '';
    return this.authService.login(email, password);
  }

  @Get('/auth/profile')
  @UseGuards(JwtAuthGuard)
  async profile(@Req() req: Request & { user?: any }) {
    const user = req.user;
    if (!user) {
      return null;
    }
    return this.authService.getProfile(user.id || user.sub);
  }
}
