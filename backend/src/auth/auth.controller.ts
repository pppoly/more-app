/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Request } from 'express';
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
  async lineRedirect(@Res() res: Response, @Req() req: Request) {
    const { channelId, redirectUri } = this.lineConfig;
    const debug = req.query.debug === '1' || req.query.debug === 'true';
    if (!channelId) {
      const message = 'LINE_CHANNEL_ID is missing in backend environment';
      return res.status(500).json({ message, client_id: null });
    }
    if (!redirectUri) {
      const message = 'LINE_REDIRECT_URI is missing';
      return res.status(500).json({ message, redirect_uri: null });
    }
    let parsedRedirect: URL;
    try {
      parsedRedirect = new URL(redirectUri);
    } catch {
      const message = 'LINE_REDIRECT_URI is invalid URL';
      return res.status(500).json({ message, redirect_uri: redirectUri });
    }
    if (parsedRedirect.protocol !== 'https:') {
      const message = 'LINE_REDIRECT_URI must use https';
      return res.status(500).json({ message, redirect_uri: redirectUri });
    }

    const state = Math.random().toString(36).substring(2, 15);
    const authorizeUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', channelId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('scope', 'profile openid');
    authorizeUrl.searchParams.set('state', state);

    if (debug) {
      const payload = {
        authorizeUrl: authorizeUrl.toString(),
        client_id: channelId,
        redirect_uri: redirectUri,
        redirect_uri_encoded: encodeURIComponent(redirectUri),
        scope: 'profile openid',
        state,
        hint: `請在 LINE Developers Console 的 LINE Login settings → Callback URL 中登记以下 URL：${redirectUri}`,
      };
      console.info('[LINE][authorize][debug]', payload);
      return res.status(200).json(payload);
    }

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

  @Post('line/liff-login')
  async lineLiffLogin(@Body() body: { idToken?: string; displayName?: string; pictureUrl?: string }) {
    if (!body?.idToken) {
      throw new BadRequestException('idToken is required');
    }
    return this.authService.lineLiffLogin(body.idToken, {
      displayName: body.displayName,
      pictureUrl: body.pictureUrl,
    });
  }

  @Post('line/liff')
  async lineLiffTokenLogin(
    @Body()
    body: {
      idToken?: string;
      accessToken?: string;
      displayName?: string;
      pictureUrl?: string;
    },
  ) {
    if (!body?.idToken && !body?.accessToken) {
      throw new BadRequestException('idToken or accessToken is required');
    }
    return this.authService.lineLiffTokenLogin(body.idToken, body.accessToken, {
      displayName: body.displayName,
      pictureUrl: body.pictureUrl,
    });
  }

  @Post('line/liff-profile')
  async lineLiffProfile(
    @Body()
    body: {
      lineUserId?: string;
      displayName?: string | null;
      pictureUrl?: string | null;
    },
    @Req() req: Request,
  ) {
    if ((req.headers['x-liff-entry'] as string | undefined) !== '1') {
      throw new ForbiddenException('Missing X-LIFF-ENTRY header');
    }
    if (!body?.lineUserId) {
      throw new BadRequestException('lineUserId is required');
    }
    return this.authService.lineLiffProfile(body.lineUserId, body.displayName, body.pictureUrl);
  }
}
