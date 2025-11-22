import { Injectable, Logger } from '@nestjs/common';

export type NotificationChannel = 'email' | 'push' | 'line' | 'inapp';

export interface NotificationTarget {
  userId: string;
  email?: string | null;
  lineId?: string | null;
  pushToken?: string | null;
}

export interface NotificationPayload {
  eventType: string;
  title: string;
  body: string;
  url?: string;
  meta?: Record<string, unknown>;
  channels?: NotificationChannel[];
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  async notify(targets: NotificationTarget[], payload: NotificationPayload) {
    const channels: NotificationChannel[] = payload.channels?.length ? payload.channels : ['inapp'];
    for (const target of targets) {
      for (const channel of channels) {
        await this.dispatch(channel, target, payload);
      }
    }
    return { delivered: targets.length * channels.length };
  }

  private async dispatch(channel: NotificationChannel, target: NotificationTarget, payload: NotificationPayload) {
    // 简易占位：实际发送逻辑（邮件/推送/LINE）可在这里接入
    this.logger.log(
      `${channel.toUpperCase()} notify -> user ${target.userId} | ${payload.eventType} | ${payload.title}`,
    );
    if (channel === 'email' && !target.email) {
      this.logger.warn(`Email skipped: no address for user ${target.userId}`);
    }
    if (channel === 'line' && !target.lineId) {
      this.logger.warn(`LINE skipped: no lineId for user ${target.userId}`);
    }
    if (channel === 'push' && !target.pushToken) {
      this.logger.warn(`Push skipped: no pushToken for user ${target.userId}`);
    }
    return true;
  }
}
