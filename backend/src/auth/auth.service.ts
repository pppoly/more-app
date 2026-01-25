/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { getLineConfig } from './line.config';
import { promises as fs } from 'fs';
import { extname, join } from 'path';
import { UPLOAD_ROOT } from '../common/storage/upload-root';

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
  private readonly logger = new Logger(AuthService.name);
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
        lineUserId: true,
        email: true,
        phone: true,
        language: true,
        preferredLocale: true,
        prefecture: true,
        avatarUrl: true,
        authProviders: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        lastLoginAt: true,
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
    const envLabel = (process.env.APP_ENV || process.env.NODE_ENV || '').toLowerCase();
    const isProdLike = envLabel === 'production' || envLabel === 'prod';
    if (isProdLike) {
      this.logger.log(`[EmailLogin] code generated for ${normalized}`);
    } else {
      this.logger.log(`[EmailLogin] ${normalized}\nSubject: ${subject}\n${body}`);
    }
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
    if (!channelId) {
      throw new BadRequestException('LINE_CHANNEL_ID is missing');
    }
    if (!channelSecret) {
      throw new BadRequestException('LINE_CHANNEL_SECRET is missing');
    }
    if (!redirectUri) {
      throw new BadRequestException('LINE_REDIRECT_URI is missing');
    }
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

  private async saveLineAvatar(userId: string, pictureUrl?: string | null): Promise<string | null> {
    if (!pictureUrl) return null;
    try {
      const response = await firstValueFrom(
        this.httpService.get(pictureUrl, {
          responseType: 'arraybuffer',
        }),
      );
      const contentType = (response.headers['content-type'] as string | undefined)?.toLowerCase() ?? '';
      let ext = '.jpg';
      if (contentType.includes('png')) ext = '.png';
      else if (contentType.includes('webp')) ext = '.webp';
      else {
        const pathExt = extname(new URL(pictureUrl).pathname).toLowerCase();
        if (pathExt) ext = pathExt;
      }
      const dir = join(UPLOAD_ROOT, 'avatars', userId);
      await fs.mkdir(dir, { recursive: true });
      const filename = `line-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      await fs.writeFile(join(dir, filename), Buffer.from(response.data));
      return `/uploads/avatars/${userId}/${filename}`;
    } catch (err) {
      // 如果拉取失败，不阻断登录流程
      return null;
    }
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

    const displayName = profile.displayName?.trim() || 'LINEユーザー';
    let user = await this.prisma.user.findFirst({
      where: { lineUserId: profile.userId },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          lineUserId: profile.userId,
          name: displayName,
          language: 'ja',
          preferredLocale: 'ja',
        },
      });
    }

    const storedAvatar = await this.saveLineAvatar(user.id, profile.pictureUrl);
    const updateData: Record<string, any> = {
      name: displayName,
      language: 'ja',
      preferredLocale: 'ja',
    };
    if (storedAvatar) {
      updateData.avatarUrl = storedAvatar;
    }
    user = await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    const accessToken = await this.jwtService.signAsync({ sub: user.id, userId: user.id });
    return { accessToken, user };
  }

  async verifyLineIdToken(idToken: string) {
    if (!this.lineConfig.channelId || !this.lineConfig.channelSecret) {
      throw new BadRequestException('LINE channel is not configured');
    }
    const { channelId, channelSecret } = this.lineConfig;
    const url = 'https://api.line.me/oauth2/v2.1/verify';
    const params = new URLSearchParams({
      id_token: idToken,
      client_id: channelId,
      client_secret: channelSecret,
    });
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(url, params.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      );
      return data as { sub?: string; name?: string; picture?: string };
    } catch (error: any) {
      const status = error?.response?.status;
      const body = error?.response?.data;
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        // eslint-disable-next-line no-console
        console.error('[LINE][verifyIdToken] failed', { status, body });
      }
      throw new BadRequestException('Failed to verify LIFF token');
    }
  }

  async lineLiffLogin(
    idToken: string,
    profileHint?: { displayName?: string | null; pictureUrl?: string | null },
  ) {
    const verified = await this.verifyLineIdToken(idToken).catch(() => null);
    const lineUserId = verified?.sub;
    if (!lineUserId) {
      throw new BadRequestException('Failed to verify LIFF token');
    }
    const displayName =
      verified?.name?.trim() || profileHint?.displayName?.trim() || 'LINEユーザー';
    const pictureUrl = verified?.picture || profileHint?.pictureUrl || null;

    const user = await this.upsertLineUser(lineUserId, displayName, pictureUrl);

    const accessToken = await this.jwtService.signAsync({ sub: user.id, userId: user.id });
    return { accessToken, user };
  }

  async lineLiffTokenLogin(
    idToken?: string,
    accessToken?: string,
    profileHint?: { displayName?: string | null; pictureUrl?: string | null },
  ) {
    let lineUserId: string | null | undefined;
    let displayName = profileHint?.displayName?.trim();
    let pictureUrl = profileHint?.pictureUrl || null;

    if (idToken) {
      const verified = await this.verifyLineIdToken(idToken).catch(() => null);
      if (verified?.sub) {
        lineUserId = verified.sub;
        displayName = verified.name?.trim() || displayName;
        pictureUrl = verified.picture || pictureUrl;
      }
    }

    if (!lineUserId && accessToken) {
      const profile = await this.fetchLineProfile(accessToken).catch(() => null);
      if (profile?.userId) {
        lineUserId = profile.userId;
        displayName = profile.displayName?.trim() || displayName;
        pictureUrl = profile.pictureUrl || pictureUrl;
      }
    }

    if (!lineUserId) {
      throw new BadRequestException('LINE認証に失敗しました');
    }

    const name = displayName || 'LINEユーザー';
    const user = await this.upsertLineUser(lineUserId, name, pictureUrl);

    const signed = await this.jwtService.signAsync({ sub: user.id, userId: user.id });
    return { accessToken: signed, user };
  }

  async lineLiffProfile(lineUserId: string, displayName?: string | null, pictureUrl?: string | null) {
    const name = displayName?.trim() || 'LINEユーザー';
    const user = await this.upsertLineUser(lineUserId, name, pictureUrl, { preserveExistingProfile: true });
    const accessToken = await this.jwtService.signAsync({ sub: user.id, userId: user.id });
    return { accessToken, user };
  }

  private async upsertLineUser(
    lineUserId: string,
    displayName: string,
    pictureUrl?: string | null,
    options?: { preserveExistingProfile?: boolean },
  ) {
    let user = await this.prisma.user.findFirst({
      where: { lineUserId },
    });

    const preserve = options?.preserveExistingProfile ?? false;

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          lineUserId,
          name: displayName,
          language: 'ja',
          preferredLocale: 'ja',
        },
      });
    }

    const shouldStoreAvatar = !preserve || !user.avatarUrl;
    const storedAvatar = shouldStoreAvatar ? await this.saveLineAvatar(user.id, pictureUrl) : null;
    const updateData: Record<string, any> = {};

    if (!preserve || !user.name) {
      updateData.name = displayName;
    }
    updateData.language = 'ja';
    updateData.preferredLocale = 'ja';
    if (storedAvatar && (!preserve || !user.avatarUrl)) {
      updateData.avatarUrl = storedAvatar;
    }

    if (Object.keys(updateData).length > 0) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    }

    return user;
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
