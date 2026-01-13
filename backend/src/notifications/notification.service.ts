/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-floating-promises, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getNotificationConfig } from './notification.config';
import { NOTIFICATION_TEMPLATES } from './notification.templates';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationContent,
  NotificationData,
  NotificationEmailContent,
  NotificationLocale,
  NotificationSendResult,
  NotificationTemplate,
  NotificationType,
} from './notification.types';
import { formatJstDateTime, formatYen, normalizeLocale, renderTemplate } from './notification.utils';

const LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';
const BREVO_EMAIL_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

type NotificationRecipient = {
  id: string | null;
  name?: string | null;
  email?: string | null;
  lineUserId?: string | null;
  locale: NotificationLocale;
};

type ChannelPreferences = {
  line?: boolean;
  email?: boolean;
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly config = getNotificationConfig();

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  async notifyRegistrationSuccess(registrationId: string) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            lineUserId: true,
            preferredLocale: true,
            language: true,
          },
        },
        ticketType: {
          select: {
            name: true,
            price: true,
          },
        },
        event: {
          select: {
            id: true,
            title: true,
            startTime: true,
            locationText: true,
            community: {
              select: {
                id: true,
                name: true,
                slug: true,
                owner: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    lineUserId: true,
                    preferredLocale: true,
                    language: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!registration || !registration.event || !registration.user) {
      this.logger.warn(`Registration notification skipped: missing data registrationId=${registrationId}`);
      return { sent: 0 };
    }

    const eventTitle = this.getLocalizedText(registration.event.title) || 'イベント';
    const { date: eventDate, time: eventTime } = formatJstDateTime(registration.event.startTime);
    const location = registration.event.locationText || '';
    const ticketName = this.getLocalizedText(registration.ticketType?.name) || '参加チケット';
    const amountText = (registration.ticketType?.price ?? 0) > 0 ? formatYen(registration.ticketType?.price) : '無料';
    const userName = registration.user.name || 'ゲスト';

    const userData: NotificationData = {
      eventTitle,
      eventDate,
      eventTime,
      location,
    };
    const organizerData: NotificationData = {
      eventTitle,
      userName,
      ticketName,
      amountText,
    };

    const userRecipient = this.buildRecipientFromUser(registration.user);
    const organizerRecipient = registration.event.community?.owner
      ? this.buildRecipientFromUser(registration.event.community.owner)
      : null;

    const results: NotificationSendResult[] = [];
    results.push(
      ...(await this.sendNotification('user.registration.success', userRecipient, userData, {
        idempotencyKey: `user.registration.success:${registrationId}`,
      })),
    );

    if (organizerRecipient) {
      results.push(
        ...(await this.sendNotification('organizer.registration.success', organizerRecipient, organizerData, {
          idempotencyKey: `organizer.registration.success:${registrationId}`,
        })),
      );
    }

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyRegistrationCancelled(registrationId: string, kind: 'free' | 'paid') {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            lineUserId: true,
            preferredLocale: true,
            language: true,
          },
        },
        event: {
          select: {
            id: true,
            title: true,
            community: {
              select: {
                owner: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    lineUserId: true,
                    preferredLocale: true,
                    language: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!registration || !registration.event || !registration.user) {
      this.logger.warn(`Cancel notification skipped: missing data registrationId=${registrationId}`);
      return { sent: 0 };
    }

    const eventTitle = this.getLocalizedText(registration.event.title) || 'イベント';
    const userRecipient = this.buildRecipientFromUser(registration.user);
    const organizerRecipient = registration.event.community?.owner
      ? this.buildRecipientFromUser(registration.event.community.owner)
      : null;

    const results: NotificationSendResult[] = [];
    results.push(
      ...(await this.sendNotification('user.cancel.success', userRecipient, { eventTitle }, {
        idempotencyKey: `user.cancel.success:${registrationId}`,
      })),
    );

    if (organizerRecipient) {
      const type = kind === 'paid' ? 'organizer.registration.cancel_paid' : 'organizer.registration.cancel_free';
      results.push(
        ...(await this.sendNotification(type, organizerRecipient, { eventTitle }, {
          idempotencyKey: `${type}:${registrationId}`,
        })),
      );
    }

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyRefundSuccess(params: { registrationId: string; refundAmount?: number | null; refundId?: string | null }) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: params.registrationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            lineUserId: true,
            preferredLocale: true,
            language: true,
          },
        },
        event: {
          select: { title: true },
        },
      },
    });

    if (!registration || !registration.event || !registration.user) {
      this.logger.warn(`Refund notification skipped: missing data registrationId=${params.registrationId}`);
      return { sent: 0 };
    }

    const eventTitle = this.getLocalizedText(registration.event.title) || 'イベント';
    const refundAmount = formatYen(params.refundAmount ?? registration.amount);
    const userRecipient = this.buildRecipientFromUser(registration.user);
    const key = params.refundId ? `user.refund.success:${params.refundId}` : `user.refund.success:${params.registrationId}`;

    const results = await this.sendNotification('user.refund.success', userRecipient, { eventTitle, refundAmount }, { idempotencyKey: key });

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyEventPublished(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        community: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!event || !event.community) {
      this.logger.warn(`Event publish notification skipped: event not found ${eventId}`);
      return { total: 0, sent: 0, skipped: 0 };
    }

    const followers = await this.prisma.communityFollow.findMany({
      where: {
        communityId: event.community.id,
      },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            lineUserId: true,
            preferredLocale: true,
            language: true,
          },
        },
      },
    });

    const userIds = followers.map((f) => f.user?.id).filter((id): id is string => Boolean(id));
    const preferenceRows = userIds.length
      ? await this.prisma.notificationPreference.findMany({
          where: {
            userId: { in: userIds },
            category: 'marketing',
          },
        })
      : [];

    const preferenceMap = new Map<string, ChannelPreferences>();
    for (const row of preferenceRows) {
      const existing = preferenceMap.get(row.userId) ?? {};
      preferenceMap.set(row.userId, { ...existing, [row.channel]: row.enabled });
    }

    const eventTitle = this.getLocalizedText(event.title) || 'イベント';
    const url = this.resolveEventUrl(event.id, event.community.slug ?? undefined);

    let sent = 0;
    let skipped = 0;

    for (const follower of followers) {
      if (!follower.user) {
        skipped += 1;
        continue;
      }
      const recipient = this.buildRecipientFromUser(follower.user);
      const results = await this.sendNotification(
        'user.community.event_published',
        recipient,
        {
          eventTitle,
          communityName: event.community.name,
          url,
        },
        {
          idempotencyKey: `user.community.event_published:${event.id}:${recipient.id}`,
          preferences: preferenceMap.get(follower.user.id) ?? undefined,
        },
      );
      const sentCount = results.filter((r) => r.status === 'sent').length;
      sent += sentCount;
      if (!sentCount) skipped += 1;
    }

    return { total: followers.length, sent, skipped };
  }

  async sendEventReminders(options?: { targetDate?: string; dryRun?: boolean }) {
    const range = this.resolveReminderRange(options?.targetDate);
    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        status: { in: ['paid', 'approved'] },
        OR: [{ paymentStatus: 'paid' }, { amount: 0 }],
        event: {
          startTime: { gte: range.startUtc, lt: range.endUtc },
          status: 'open',
        },
      },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            startTime: true,
            locationText: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            lineUserId: true,
            preferredLocale: true,
            language: true,
          },
        },
      },
    });

    if (options?.dryRun) {
      return {
        targetDate: range.dateKey,
        timeZone: this.config.timeZone,
        total: registrations.length,
        dryRun: true,
      };
    }

    let sent = 0;
    let skipped = 0;

    for (const registration of registrations) {
      if (!registration.user || !registration.event) {
        skipped += 1;
        continue;
      }
      const recipient = this.buildRecipientFromUser(registration.user);
      const eventTitle = this.getLocalizedText(registration.event.title) || 'イベント';
      const { date: eventDate, time: eventTime } = formatJstDateTime(registration.event.startTime);
      const location = registration.event.locationText || '';
      const results = await this.sendNotification(
        'user.event.reminder',
        recipient,
        {
          eventTitle,
          eventDate,
          eventTime,
          location,
        },
        {
          idempotencyKey: `user.event.reminder:${registration.event.id}:${recipient.id}:${range.dateKey}`,
        },
      );
      const sentCount = results.filter((r) => r.status === 'sent').length;
      sent += sentCount;
      if (!sentCount) skipped += 1;
    }

    return {
      targetDate: range.dateKey,
      timeZone: this.config.timeZone,
      total: registrations.length,
      sent,
      skipped,
    };
  }

  async notifyAdmin(type: 'admin.system.alert' | 'admin.business.alert' | 'admin.notification.alert', message: string) {
    const recipient: NotificationRecipient = {
      id: null,
      name: 'Admin',
      email: this.config.adminEmail || null,
      lineUserId: null,
      locale: 'ja',
    };

    return this.sendNotification(type, recipient, { message }, { idempotencyKey: `${type}:${Date.now()}` });
  }

  async notifyRefundByStripeCharge(
    chargeId: string,
    paymentIntentId?: string | null,
    refundId?: string | null,
    refundAmount?: number | null,
  ) {
    const whereClauses: Prisma.PaymentWhereInput[] = [{ stripeChargeId: chargeId }];
    if (paymentIntentId) {
      whereClauses.push({ stripePaymentIntentId: paymentIntentId });
    }
    const payment = await this.prisma.payment.findFirst({
      where: { OR: whereClauses },
    });
    if (!payment?.registrationId) {
      this.logger.warn(`Refund notification skipped: payment not found for charge ${chargeId}`);
      return { sent: 0 };
    }
    return this.notifyRefundSuccess({
      registrationId: payment.registrationId,
      refundAmount: refundAmount ?? payment.amount,
      refundId: refundId ?? payment.stripeRefundId ?? chargeId,
    });
  }

  async notifyRefundByPayment(paymentId: string, refundId?: string | null, refundAmount?: number | null) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment?.registrationId) {
      this.logger.warn(`Refund notification skipped: payment not found ${paymentId}`);
      return { sent: 0 };
    }
    return this.notifyRefundSuccess({
      registrationId: payment.registrationId,
      refundAmount: refundAmount ?? payment.amount,
      refundId: refundId ?? payment.stripeRefundId ?? paymentId,
    });
  }

  private async sendNotification(
    type: NotificationType,
    recipient: NotificationRecipient,
    data: NotificationData,
    options: { idempotencyKey: string; preferences?: ChannelPreferences },
  ) {
    const template = NOTIFICATION_TEMPLATES[type];
    if (!template) {
      this.logger.warn(`Notification template missing: ${type}`);
      return [] as NotificationSendResult[];
    }

    const channels = await this.resolveChannels(recipient, template.category, options.preferences, type);
    if (!channels.length) {
      return [] as NotificationSendResult[];
    }

    const results: NotificationSendResult[] = [];
    for (const channel of channels) {
      const rendered = this.renderByChannel(template, recipient.locale, data, channel);
      if (!rendered) {
        results.push({ channel, status: 'skipped', errorMessage: 'template_missing' });
        continue;
      }
      results.push(
        await this.deliverChannel({
          recipient,
          type,
          category: template.category,
          channel,
          idempotencyKey: options.idempotencyKey,
          content: rendered,
          data,
        }),
      );
    }
    return results;
  }

  private async resolveChannels(
    recipient: NotificationRecipient,
    category: NotificationCategory,
    preferences?: ChannelPreferences,
    type?: NotificationType,
  ) {
    const lineAvailable = Boolean(recipient.lineUserId) && Boolean(this.config.lineAccessToken);
    const emailAvailable = Boolean(recipient.email) && Boolean(this.config.brevoApiKey) && Boolean(this.config.brevoSenderEmail);

    let lineAllowed = lineAvailable;
    let emailAllowed = emailAvailable;

    if (category === 'marketing' && recipient.id) {
      const prefs = preferences ?? (await this.getMarketingPreferences(recipient.id));
      if (prefs.line === false) lineAllowed = false;
      if (prefs.email === false) emailAllowed = false;
    }

    if (lineAllowed) return ['line'] as NotificationChannel[];
    if (emailAllowed) return ['email'] as NotificationChannel[];

    if (type) {
      this.logger.log(`Notification skipped: no channel (${type}) user=${recipient.id ?? 'n/a'}`);
    }
    return [] as NotificationChannel[];
  }

  private renderByChannel(
    template: NotificationTemplate,
    locale: NotificationLocale,
    data: NotificationData,
    channel: NotificationChannel,
  ) {
    if (channel === 'line') {
      const content = this.resolveLocalizedContent(template.line, locale);
      if (!content) return null;
      return {
        title: renderTemplate(content.title, data),
        body: renderTemplate(content.body, data),
      } as NotificationContent;
    }
    const content = this.resolveLocalizedContent(template.email, locale);
    if (!content) return null;
    return {
      subject: renderTemplate(content.subject, data),
      body: renderTemplate(content.body, data),
    } as NotificationEmailContent;
  }

  private resolveLocalizedContent<T>(templates: Partial<Record<NotificationLocale, T>>, locale: NotificationLocale) {
    return templates[locale] || templates.ja || null;
  }

  private async deliverChannel(params: {
    recipient: NotificationRecipient;
    type: NotificationType;
    category: NotificationCategory;
    channel: NotificationChannel;
    idempotencyKey: string;
    content: NotificationContent | NotificationEmailContent;
    data: NotificationData;
  }): Promise<NotificationSendResult> {
    const deliveryKey = `${params.idempotencyKey}:${params.channel}`;
    const existing = await this.prisma.notificationDelivery.findUnique({ where: { idempotencyKey: deliveryKey } });
    if (existing) {
      return { channel: params.channel, status: 'skipped', errorMessage: 'idempotent' };
    }

    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        idempotencyKey: deliveryKey,
        userId: params.recipient.id ?? undefined,
        role: NOTIFICATION_TEMPLATES[params.type].role,
        type: params.type,
        category: params.category,
        channel: params.channel,
        status: 'processing',
        meta: {
          data: params.data,
        },
      },
    });

    try {
      let providerMessageId: string | undefined;
      if (params.channel === 'line') {
        if (!params.recipient.lineUserId) {
          throw new Error('LINE userId missing');
        }
        providerMessageId = await this.sendLineMessage(params.recipient.lineUserId, params.content as NotificationContent);
      } else {
        if (!params.recipient.email) {
          throw new Error('Email missing');
        }
        providerMessageId = await this.sendEmailMessage(params.recipient, params.content as NotificationEmailContent);
      }

      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'sent',
          providerMessageId: providerMessageId ?? undefined,
        },
      });

      return { channel: params.channel, status: 'sent' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: 'failed',
          errorMessage,
        },
      });
      this.logger.warn(`Notification failed: ${params.type} (${params.channel}) ${errorMessage}`);
      return { channel: params.channel, status: 'failed', errorMessage };
    }
  }

  private async sendLineMessage(lineUserId: string, content: NotificationContent) {
    if (!this.config.lineAccessToken) {
      throw new Error('LINE access token is not configured');
    }
    const text = [content.title, content.body].filter(Boolean).join('\n');
    const response = await firstValueFrom(
      this.httpService.post(
        LINE_PUSH_ENDPOINT,
        {
          to: lineUserId,
          messages: [{ type: 'text', text }],
        },
        {
          headers: {
            Authorization: `Bearer ${this.config.lineAccessToken}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );
    const requestId = response.headers?.['x-line-request-id'];
    if (typeof requestId === 'string') return requestId;
    if (Array.isArray(requestId) && requestId[0]) return requestId[0];
    return undefined;
  }

  private async sendEmailMessage(recipient: NotificationRecipient, content: NotificationEmailContent) {
    if (!this.config.brevoApiKey || !this.config.brevoSenderEmail) {
      throw new Error('Brevo email configuration is missing');
    }
    const response = await firstValueFrom(
      this.httpService.post(
        BREVO_EMAIL_ENDPOINT,
        {
          sender: {
            email: this.config.brevoSenderEmail,
            name: this.config.brevoSenderName || 'SocialMore',
          },
          to: [
            {
              email: recipient.email,
              name: recipient.name || undefined,
            },
          ],
          subject: content.subject,
          textContent: content.body,
        },
        {
          headers: {
            'api-key': this.config.brevoApiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        },
      ),
    );
    const messageId = response.data?.messageId;
    return typeof messageId === 'string' ? messageId : undefined;
  }

  private buildRecipientFromUser(user: {
    id: string;
    name?: string | null;
    email?: string | null;
    lineUserId?: string | null;
    preferredLocale?: string | null;
    language?: string | null;
  }): NotificationRecipient {
    return {
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
      lineUserId: user.lineUserId ?? null,
      locale: normalizeLocale(user.preferredLocale || user.language),
    };
  }

  private async getMarketingPreferences(userId: string): Promise<ChannelPreferences> {
    const preferences = await this.prisma.notificationPreference.findMany({
      where: { userId, category: 'marketing' },
    });
    const map: ChannelPreferences = {};
    for (const pref of preferences) {
      if (pref.channel === 'line') map.line = pref.enabled;
      if (pref.channel === 'email') map.email = pref.enabled;
    }
    return map;
  }

  private getLocalizedText(content: Prisma.JsonValue | string | null | undefined): string {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (typeof content === 'object') {
      const record = content as Record<string, any>;
      if (typeof record.original === 'string') return record.original;
      if (typeof record.ja === 'string') return record.ja;
      if (typeof record.en === 'string') return record.en;
      if (typeof record.zh === 'string') return record.zh;
    }
    return '';
  }

  private resolveEventUrl(eventId: string, communitySlug?: string | null) {
    const base = (process.env.FRONTEND_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
    if (communitySlug) {
      return `${base}/events/${eventId}`;
    }
    return `${base}/events/${eventId}`;
  }

  private resolveReminderRange(targetDate?: string) {
    if (targetDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        throw new Error('targetDate must be YYYY-MM-DD');
      }
      const [year, month, day] = targetDate.split('-').map(Number);
      const startUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - JST_OFFSET_MS);
      const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
      return { startUtc, endUtc, dateKey: targetDate };
    }
    const now = new Date();
    const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
    const year = jstNow.getUTCFullYear();
    const month = jstNow.getUTCMonth();
    const day = jstNow.getUTCDate() + 1;
    const startUtc = new Date(Date.UTC(year, month, day, 0, 0, 0) - JST_OFFSET_MS);
    const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
    const dateKey = `${String(year)}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { startUtc, endUtc, dateKey };
  }
}
