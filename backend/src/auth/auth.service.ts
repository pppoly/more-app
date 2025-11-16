import { BadRequestException, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { getLineConfig } from './line.config';

interface DevLoginPayload {
  name: string;
  language?: string;
}

@Injectable()
export class AuthService {
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

    let user = await this.prisma.user.findFirst({
      where: { name },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          name,
          language: payload.language || 'ja',
          prefecture: 'Tokyo',
        },
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
        prefecture: true,
        avatarUrl: true,
      },
    });
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
        },
      });
    }

    const accessToken = await this.jwtService.signAsync({ sub: user.id, userId: user.id });
    return { accessToken, user };
  }
}
