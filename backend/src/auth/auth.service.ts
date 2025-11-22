import { BadRequestException, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { getLineConfig } from './line.config';

interface DevLoginPayload {
  name: string;
  language?: string;
  preferredLocale?: string;
}

interface EmailCodeEntry {
  code: string;
  expiresAt: number;
}

@Injectable()
export class AuthService {
  private emailCodeStore = new Map<string, EmailCodeEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly httpService: HttpService,
  ) {}

  private lineConfig = getLineConfig();

  async devLogin(payload: DevLoginPayload) {
    const name = payload.name?.trim();
    if (!name) {
      throw new BadRequestException('Name is required');
    }

    const isAdminName = name.toLowerCase() === 'admin';

    let user = await this.prisma.user.findFirst({
      where: { name },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          name,
          language: payload.language || 'ja',
          preferredLocale: payload.preferredLocale || payload.language || 'ja',
          prefecture: 'Tokyo',
          isAdmin: isAdminName,
          isOrganizer: true,
        },
      });
    } else if (isAdminName && !user.isAdmin) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { isAdmin: true, isOrganizer: true },
      });
    } else if (!user.isOrganizer) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { isOrganizer: true },
      });
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      userId: user.id,
    });

    return {
      accessToken,
      user,
    };
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
      language: true,
        preferredLocale: true,
      prefecture: true,
      avatarUrl: true,
      isOrganizer: true,
      isAdmin: true,
    },
    });
  }

  async sendEmailLoginCode(email: string) {
    const normalized = this.normalizeEmail(email);
    if (!normalized) {
      throw new BadRequestException('Invalid email');
    }
    const code = this.generateCode();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    this.emailCodeStore.set(normalized, { code, expiresAt });
    // Mock email sending: log message for developers/testing.
    const subject = `Your MORE verification code: ${code}`;
    const body = `You can use the code ${code} to log into MORE App.\n\nCode: ${code}\nValid for 5 minutes.`;
    console.info(`[EmailLogin] ${normalized}\nSubject: ${subject}\n${body}`);
    return { success: true };
  }

  async verifyEmailLoginCode(email: string, code: string) {
    const normalized = this.normalizeEmail(email);
    if (!normalized) {
      throw new BadRequestException('Invalid email');
    }
    const entry = this.emailCodeStore.get(normalized);
    if (!entry) {
      throw new BadRequestException('Verification code not found. Please request a new code.');
    }
    if (Date.now() > entry.expiresAt) {
      this.emailCodeStore.delete(normalized);
      throw new BadRequestException('Verification code has expired. Please request a new code.');
    }
    if (entry.code !== code) {
      throw new BadRequestException('Verification code is incorrect.');
    }
    let user = await this.prisma.user.findFirst({
      where: { email: normalized },
    });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: normalized,
          name: normalized.split('@')[0],
          language: 'ja',
          preferredLocale: 'ja',
        },
      });
    }
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      userId: user.id,
    });
    this.emailCodeStore.delete(normalized);
    return { accessToken, user };
  }

  async exchangeLineToken(code: string) {
    const { channelId, channelSecret, redirectUri } = this.lineConfig;
    const url = 'https://api.line.me/oauth2/v2.1/token';
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: channelId,
      client_secret: channelSecret,
    });

    const { data } = await firstValueFrom(
      this.httpService.post(url, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );

    return data;
  }

  async fetchLineProfile(accessToken: string) {
    const { data } = await firstValueFrom(
      this.httpService.get('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    );
    return data;
  }

  async lineLogin(code: string) {
    const tokenResponse = await this.exchangeLineToken(code).catch(() => null);
    if (!tokenResponse?.access_token) {
      throw new BadRequestException('Failed to exchange LINE token');
    }

    const profile = await this.fetchLineProfile(tokenResponse.access_token).catch(() => null);
    if (!profile?.userId) {
      throw new BadRequestException('Failed to load LINE profile');
    }

    let user = await this.prisma.user.findFirst({
      where: { lineUserId: profile.userId },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          lineUserId: profile.userId,
          name: profile.displayName || 'LINE User',
          avatarUrl: profile.pictureUrl,
          language: 'ja',
          preferredLocale: 'ja',
        },
      });
    }

    const accessToken = await this.jwtService.signAsync({ sub: user.id, userId: user.id });
    return { accessToken, user };
  }

  private normalizeEmail(email: string | undefined | null) {
    if (!email) return '';
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) return '';
    return trimmed;
  }

  private generateCode() {
    const value = Math.floor(100000 + Math.random() * 900000);
    return value.toString();
  }
}
