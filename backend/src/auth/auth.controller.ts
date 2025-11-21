import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { getLineConfig } from './line.config';

interface DevLoginDto {
  name: string;
  language?: string;
  secret?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  private lineConfig = getLineConfig();

  @Post('dev-login')
  async devLogin(@Body() body: DevLoginDto) {
    const allowDevLogin =
      process.env.DEV_LOGIN_ENABLED === 'true' || (process.env.NODE_ENV || '').toLowerCase() !== 'production';
    if (!allowDevLogin) {
      throw new ForbiddenException('Dev login is disabled in this environment');
    }
    const requiredSecret = process.env.DEV_LOGIN_SECRET;
    if (requiredSecret && body?.secret !== requiredSecret) {
      throw new ForbiddenException('Invalid dev login secret');
    }
    return this.authService.devLogin(body);
  }

  @Get('line/redirect')
  async lineRedirect(@Res() res: Response) {
    const { channelId, redirectUri } = this.lineConfig;
    const state = Math.random().toString(36).substring(2, 15);
    const authorizeUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', channelId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('scope', 'profile openid');
    authorizeUrl.searchParams.set('state', state);

    return res.redirect(authorizeUrl.toString());
  }

  @Get('line/callback')
  async lineCallback(@Query('code') code: string, @Res() res: Response) {
    if (!code) {
      return res.status(400).json({ message: 'Missing code' });
    }

    try {
      const { accessToken } = await this.authService.lineLogin(code);
      const redirectUrl = `${this.lineConfig.frontendBaseUrl}/auth/callback?token=${accessToken}`;
      return res.redirect(redirectUrl);
    } catch (error) {
      const redirectUrl = `${this.lineConfig.frontendBaseUrl}/auth/callback?error=1`;
      return res.redirect(redirectUrl);
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    const user = await this.authService.getProfile(req.user.id);
    return user;
  }

  @Post('email/send-code')
  async sendEmailCode(@Body() body: { email?: string }) {
    if (!body?.email) {
      throw new BadRequestException('email is required');
    }
    return this.authService.sendEmailLoginCode(body.email);
  }

  @Post('email/verify')
  async verifyEmail(@Body() body: { email?: string; code?: string }) {
    if (!body?.email || !body?.code) {
      throw new BadRequestException('email and code are required');
    }
    return this.authService.verifyEmailLoginCode(body.email, body.code);
  }
}
