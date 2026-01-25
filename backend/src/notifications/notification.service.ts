/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-floating-promises, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
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
  NotificationRole,
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

  async sendTestEmail(params: {
    toEmail: string;
    toName?: string;
    subject?: string;
    body?: string;
    dryRun?: boolean;
  }) {
    const toEmail = (params.toEmail || '').trim();
    if (!toEmail) {
      throw new BadRequestException('toEmail is required');
    }
    if (params.dryRun) {
      if (!this.config.brevoApiKey || !this.config.brevoSenderEmail) {
        throw new Error('Brevo email configuration is missing');
      }
      return { dryRun: true };
    }

    const recipient: NotificationRecipient = {
      id: null,
      name: (params.toName || '').trim() || null,
      email: toEmail,
      lineUserId: null,
      locale: 'ja',
    };
    const content: NotificationEmailContent = {
      subject: (params.subject || '').trim() || '[SocialMore] Brevo test email',
      body: params.body || 'Brevo email sending test from SocialMore backend.',
    };

    const messageId = await this.sendEmailMessage(recipient, content);
    return { messageId };
  }

  async listTemplateSettings() {
    const types = Object.keys(NOTIFICATION_TEMPLATES) as NotificationType[];
    const settings = types.length
      ? await this.prisma.notificationTemplateSetting.findMany({ where: { type: { in: types } } })
      : [];
    const map = new Map(settings.map((setting) => [setting.type, setting]));

    return types.map((type) => {
      const template = NOTIFICATION_TEMPLATES[type];
      const defaultEnabled = template.defaultEnabled ?? true;
      const stored = map.get(type);
      const enabled = stored ? stored.enabled : defaultEnabled;
      return {
        type,
        label: template.label ?? type,
        description: template.description ?? null,
        role: template.role,
        category: template.category,
        defaultEnabled,
        enabled,
        overridden: Boolean(stored),
        channels: {
          line: Boolean(Object.keys(template.line || {}).length),
          email: Boolean(Object.keys(template.email || {}).length),
        },
      };
    });
  }

  async updateTemplateSetting(type: NotificationType, enabled: boolean) {
    const template = NOTIFICATION_TEMPLATES[type];
    if (!template) {
      throw new BadRequestException('Notification template not found');
    }
    const setting = await this.prisma.notificationTemplateSetting.upsert({
      where: { type },
      update: { enabled },
      create: { type, enabled },
    });
    const defaultEnabled = template.defaultEnabled ?? true;
    return {
      type,
      label: template.label ?? type,
      description: template.description ?? null,
      role: template.role,
      category: template.category,
      defaultEnabled,
      enabled: setting.enabled,
      overridden: true,
      channels: {
        line: Boolean(Object.keys(template.line || {}).length),
        email: Boolean(Object.keys(template.email || {}).length),
      },
    };
  }

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
        payment: {
          select: {
            id: true,
            method: true,
            createdAt: true,
            updatedAt: true,
            amount: true,
            platformFee: true,
            merchantTransferAmount: true,
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
            endTime: true,
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
        lesson: {
          select: {
            id: true,
            startAt: true,
            endAt: true,
            class: {
              select: {
                id: true,
                title: true,
                locationName: true,
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
        },
      },
    });

    if (!registration || !registration.user || (!registration.event && !registration.lesson)) {
      this.logger.warn(`Registration notification skipped: missing data registrationId=${registrationId}`);
      return { sent: 0 };
    }

    const context = this.resolveEventContext(registration);
    const amountValue = registration.event ? registration.ticketType?.price ?? registration.amount ?? 0 : registration.amount ?? 0;
    const amountText = amountValue > 0 ? formatYen(amountValue) : '無料';
    const userRecipient = this.buildRecipientFromUser(registration.user);
    const organizerRecipients = await this.resolveOrganizerRecipients(context.communityId);
    const baseData = this.buildBaseNotificationData({
      recipient: userRecipient,
      registrationId: registration.id,
      eventTitle: context.eventTitle,
      eventStartAt: context.startAt,
      eventEndAt: context.endAt,
      eventLocation: context.location,
      eventId: context.eventId,
      communitySlug: context.communitySlug,
    });

    const paidAt = registration.payment?.updatedAt ?? registration.payment?.createdAt ?? registration.updatedAt ?? new Date();
    const paymentMethod = this.resolvePaymentMethodLabel(registration.payment?.method ?? null, userRecipient.locale);
    const paymentData: NotificationData = {
      ...baseData,
      amount: amountText,
      paid_at: this.formatJstDateTimeFull(paidAt),
      payment_method: paymentMethod,
    };

    const results: NotificationSendResult[] = [];
    const isPaid = amountValue > 0 && (registration.paymentStatus === 'paid' || registration.status === 'paid');
    if (isPaid) {
      results.push(
        ...(await this.sendNotification('user.payment.succeeded', userRecipient, paymentData, {
          idempotencyKey: registration.payment?.id ?? registration.id,
        })),
      );
    }

    if (organizerRecipients.length) {
      const participantDisplayName = this.maskParticipantName(registration.user?.name ?? null);
      const feeAmount = registration.payment?.platformFee ?? null;
      const netAmount =
        registration.payment?.merchantTransferAmount ??
        (amountValue > 0 ? amountValue - (registration.payment?.platformFee ?? 0) : null);
      for (const organizerRecipient of organizerRecipients) {
        const organizerBase = this.buildOrganizerBaseNotificationData({
          recipient: organizerRecipient,
          eventTitle: context.eventTitle,
          eventStartAt: context.startAt,
          eventEndAt: context.endAt,
          eventLocation: context.location,
          eventId: context.eventId,
          communitySlug: context.communitySlug,
        });
        const organizerData: NotificationData = {
          ...organizerBase,
          order_id: registration.id,
          participant_display_name: participantDisplayName,
          amount: amountText,
          fee: feeAmount ? formatYen(feeAmount) : '',
          net_amount: netAmount ? formatYen(netAmount) : '',
          paid_at: this.formatJstDateTimeFull(paidAt),
        };
        results.push(
          ...(await this.sendNotification('organizer.registration.success', organizerRecipient, organizerData, {
            idempotencyKey: registration.payment?.id ?? registration.id,
          })),
        );
      }
    }

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyRegistrationCreated(registrationId: string) {
    const registration = await this.findRegistrationForNotification(registrationId);
    if (!registration || !registration.user || (!registration.event && !registration.lesson)) {
      this.logger.warn(`Registration created notification skipped: missing data registrationId=${registrationId}`);
      return { sent: 0 };
    }

    const recipient = this.buildRecipientFromUser(registration.user);
    const context = this.resolveEventContext(registration);
    const baseData = this.buildBaseNotificationData({
      recipient,
      registrationId: registration.id,
      eventTitle: context.eventTitle,
      eventStartAt: context.startAt,
      eventEndAt: context.endAt,
      eventLocation: context.location,
      eventId: context.eventId,
      communitySlug: context.communitySlug,
    });

    const applicationStatus = this.resolveApplicationStatusText(
      registration.status,
      registration.paymentStatus,
      registration.amount ?? 0,
      recipient.locale,
    );
    const nextStepText = this.resolveRegistrationNextStepText(
      registration.status,
      registration.paymentStatus,
      registration.amount ?? 0,
      recipient.locale,
    );

    const data: NotificationData = {
      ...baseData,
      application_status: applicationStatus,
      next_step_text: nextStepText,
    };

    const results = await this.sendNotification('user.registration.created', recipient, data, {
      idempotencyKey: registration.id,
    });

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyOrganizerRegistrationPending(registrationId: string) {
    const registration = await this.findRegistrationForNotification(registrationId);
    if (!registration || !registration.user || (!registration.event && !registration.lesson)) {
      this.logger.warn(`Organizer pending notification skipped: missing data registrationId=${registrationId}`);
      return { sent: 0 };
    }
    if (registration.status !== 'pending') {
      return { sent: 0 };
    }

    const context = this.resolveEventContext(registration);
    const organizerRecipients = await this.resolveOrganizerRecipients(context.communityId);
    if (!organizerRecipients.length) {
      return { sent: 0 };
    }

    const participantDisplayName = this.maskParticipantName(registration.user?.name ?? null);
    const appliedAt = this.formatJstDateTimeFull(registration.createdAt ?? new Date());
    const results: NotificationSendResult[] = [];

    for (const organizerRecipient of organizerRecipients) {
      const organizerBase = this.buildOrganizerBaseNotificationData({
        recipient: organizerRecipient,
        eventTitle: context.eventTitle,
        eventStartAt: context.startAt,
        eventEndAt: context.endAt,
        eventLocation: context.location,
        eventId: context.eventId,
        communitySlug: context.communitySlug,
      });
      const organizerData: NotificationData = {
        ...organizerBase,
        order_id: registration.id,
        participant_display_name: participantDisplayName,
        applied_at: appliedAt,
      };
      results.push(
        ...(await this.sendNotification('organizer.registration.pending', organizerRecipient, organizerData, {
          idempotencyKey: registration.id,
        })),
      );
    }

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyRegistrationApproved(registrationId: string) {
    const registration = await this.findRegistrationForNotification(registrationId);
    if (!registration || !registration.user || (!registration.event && !registration.lesson)) {
      this.logger.warn(`Registration approved notification skipped: missing data registrationId=${registrationId}`);
      return { sent: 0 };
    }

    const recipient = this.buildRecipientFromUser(registration.user);
    const context = this.resolveEventContext(registration);
    const amountValue = registration.event ? registration.ticketType?.price ?? registration.amount ?? 0 : registration.amount ?? 0;
    const amountText = amountValue > 0 ? formatYen(amountValue) : '無料';
    const paymentRequired = amountValue > 0 && registration.paymentStatus !== 'paid';
    const nextStepText = this.resolveApprovalNextStepText(paymentRequired, recipient.locale);

    const baseData = this.buildBaseNotificationData({
      recipient,
      registrationId: registration.id,
      eventTitle: context.eventTitle,
      eventStartAt: context.startAt,
      eventEndAt: context.endAt,
      eventLocation: context.location,
      eventId: context.eventId,
      communitySlug: context.communitySlug,
    });

    const data: NotificationData = {
      ...baseData,
      amount: amountText,
      payment_url: paymentRequired ? this.resolvePaymentUrl() : '',
      payment_due_at: '',
      next_step_text: nextStepText,
    };

    const results = await this.sendNotification('user.registration.approved', recipient, data, {
      idempotencyKey: registration.id,
    });

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyRegistrationRejected(registrationId: string, reason?: string | null) {
    const registration = await this.findRegistrationForNotification(registrationId);
    if (!registration || !registration.user || (!registration.event && !registration.lesson)) {
      this.logger.warn(`Registration rejected notification skipped: missing data registrationId=${registrationId}`);
      return { sent: 0 };
    }

    const recipient = this.buildRecipientFromUser(registration.user);
    const context = this.resolveEventContext(registration);
    const baseData = this.buildBaseNotificationData({
      recipient,
      registrationId: registration.id,
      eventTitle: context.eventTitle,
      eventStartAt: context.startAt,
      eventEndAt: context.endAt,
      eventLocation: context.location,
      eventId: context.eventId,
      communitySlug: context.communitySlug,
    });

    const data: NotificationData = {
      ...baseData,
      reject_reason: reason ?? '',
    };

    const results = await this.sendNotification('user.registration.rejected', recipient, data, {
      idempotencyKey: registration.id,
    });

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyOrganizerEventSubmitted(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        locationText: true,
        community: { select: { id: true, slug: true } },
      },
    });
    if (!event?.community?.id) {
      this.logger.warn(`Organizer event submitted notification skipped: event not found ${eventId}`);
      return { sent: 0 };
    }
    const eventTitle = this.getLocalizedText(event.title) || 'イベント';
    const organizerRecipients = await this.resolveOrganizerRecipients(event.community.id);
    const results: NotificationSendResult[] = [];
    for (const organizerRecipient of organizerRecipients) {
      const organizerBase = this.buildOrganizerBaseNotificationData({
        recipient: organizerRecipient,
        eventTitle,
        eventStartAt: event.startTime,
        eventEndAt: event.endTime,
        eventLocation: event.locationText ?? '',
        eventId: event.id,
        communitySlug: event.community.slug ?? null,
      });
      results.push(
        ...(await this.sendNotification('organizer.event.submitted', organizerRecipient, organizerBase, {
          idempotencyKey: event.id,
        })),
      );
    }
    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyOrganizerEventReviewApproved(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        locationText: true,
        community: { select: { id: true, slug: true } },
      },
    });
    if (!event?.community?.id) {
      this.logger.warn(`Organizer review approved notification skipped: event not found ${eventId}`);
      return { sent: 0 };
    }
    const eventTitle = this.getLocalizedText(event.title) || 'イベント';
    const organizerRecipients = await this.resolveOrganizerRecipients(event.community.id);
    const results: NotificationSendResult[] = [];
    for (const organizerRecipient of organizerRecipients) {
      const organizerBase = this.buildOrganizerBaseNotificationData({
        recipient: organizerRecipient,
        eventTitle,
        eventStartAt: event.startTime,
        eventEndAt: event.endTime,
        eventLocation: event.locationText ?? '',
        eventId: event.id,
        communitySlug: event.community.slug ?? null,
      });
      results.push(
        ...(await this.sendNotification('organizer.event.review.approved', organizerRecipient, organizerBase, {
          idempotencyKey: event.id,
        })),
      );
    }
    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyOrganizerEventReviewRejected(eventId: string, reason?: string | null) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        locationText: true,
        community: { select: { id: true, slug: true } },
      },
    });
    if (!event?.community?.id) {
      this.logger.warn(`Organizer review rejected notification skipped: event not found ${eventId}`);
      return { sent: 0 };
    }
    const eventTitle = this.getLocalizedText(event.title) || 'イベント';
    const organizerRecipients = await this.resolveOrganizerRecipients(event.community.id);
    const results: NotificationSendResult[] = [];
    for (const organizerRecipient of organizerRecipients) {
      const organizerBase = this.buildOrganizerBaseNotificationData({
        recipient: organizerRecipient,
        eventTitle,
        eventStartAt: event.startTime,
        eventEndAt: event.endTime,
        eventLocation: event.locationText ?? '',
        eventId: event.id,
        communitySlug: event.community.slug ?? null,
      });
      const organizerData: NotificationData = {
        ...organizerBase,
        review_reason: reason ?? '',
      };
      results.push(
        ...(await this.sendNotification('organizer.event.review.rejected', organizerRecipient, organizerData, {
          idempotencyKey: event.id,
        })),
      );
    }
    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyOrganizerEventSystemCancelled(eventId: string, reason?: string | null) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        locationText: true,
        community: { select: { id: true, slug: true } },
      },
    });
    if (!event?.community?.id) {
      this.logger.warn(`Organizer system cancel notification skipped: event not found ${eventId}`);
      return { sent: 0 };
    }
    const eventTitle = this.getLocalizedText(event.title) || 'イベント';
    const organizerRecipients = await this.resolveOrganizerRecipients(event.community.id);
    const results: NotificationSendResult[] = [];
    for (const organizerRecipient of organizerRecipients) {
      const organizerBase = this.buildOrganizerBaseNotificationData({
        recipient: organizerRecipient,
        eventTitle,
        eventStartAt: event.startTime,
        eventEndAt: event.endTime,
        eventLocation: event.locationText ?? '',
        eventId: event.id,
        communitySlug: event.community.slug ?? null,
      });
      const organizerData: NotificationData = {
        ...organizerBase,
        system_action_reason: reason ?? '',
      };
      results.push(
        ...(await this.sendNotification('organizer.event.system_cancelled', organizerRecipient, organizerData, {
          idempotencyKey: event.id,
        })),
      );
    }
    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyPaymentFailed(params: {
    registrationId?: string | null;
    paymentId?: string | null;
    failureReason?: string | null;
    paymentDueAt?: Date | null;
  }) {
    const payment = await this.findPaymentForNotification(params);
    if (!payment?.registration || !payment.registration.user) {
      this.logger.warn(`Payment failed notification skipped: missing data paymentId=${params.paymentId ?? 'n/a'}`);
      return { sent: 0 };
    }

    const recipient = this.buildRecipientFromUser(payment.registration.user);
    const context = this.resolveEventContext(payment.registration);
    const amountValue = payment.amount ?? payment.registration.amount ?? 0;
    const amountText = amountValue > 0 ? formatYen(amountValue) : '無料';

    const baseData = this.buildBaseNotificationData({
      recipient,
      registrationId: payment.registration.id,
      eventTitle: context.eventTitle,
      eventStartAt: context.startAt,
      eventEndAt: context.endAt,
      eventLocation: context.location,
      eventId: context.eventId,
      communitySlug: context.communitySlug,
    });

    const data: NotificationData = {
      ...baseData,
      amount: amountText,
      payment_url: this.resolvePaymentUrl(),
      payment_due_at: params.paymentDueAt ? this.formatJstDateTimeFull(params.paymentDueAt) : '',
      failure_reason: params.failureReason ?? '',
    };

    const results = await this.sendNotification('user.payment.failed', recipient, data, {
      idempotencyKey: payment.id,
    });

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyPaymentExpired(params: {
    registrationId?: string | null;
    paymentId?: string | null;
    paymentDueAt?: Date | null;
    cancelledAt?: Date | null;
  }) {
    const payment = await this.findPaymentForNotification(params);
    if (!payment?.registration || !payment.registration.user) {
      this.logger.warn(`Payment expired notification skipped: missing data paymentId=${params.paymentId ?? 'n/a'}`);
      return { sent: 0 };
    }

    const recipient = this.buildRecipientFromUser(payment.registration.user);
    const context = this.resolveEventContext(payment.registration);
    const organizerRecipients = await this.resolveOrganizerRecipients(context.communityId);
    const baseData = this.buildBaseNotificationData({
      recipient,
      registrationId: payment.registration.id,
      eventTitle: context.eventTitle,
      eventStartAt: context.startAt,
      eventEndAt: context.endAt,
      eventLocation: context.location,
      eventId: context.eventId,
      communitySlug: context.communitySlug,
    });

    const data: NotificationData = {
      ...baseData,
      payment_due_at: params.paymentDueAt ? this.formatJstDateTimeFull(params.paymentDueAt) : '',
      cancelled_at: params.cancelledAt ? this.formatJstDateTimeFull(params.cancelledAt) : '',
    };

    const results = await this.sendNotification('user.payment.expired', recipient, data, {
      idempotencyKey: payment.id,
    });

    if (organizerRecipients.length) {
      const participantDisplayName = this.maskParticipantName(payment.registration.user?.name ?? null);
      const cancelledAt = params.cancelledAt ? this.formatJstDateTimeFull(params.cancelledAt) : '';
      for (const organizerRecipient of organizerRecipients) {
        const organizerBase = this.buildOrganizerBaseNotificationData({
          recipient: organizerRecipient,
          eventTitle: context.eventTitle,
          eventStartAt: context.startAt,
          eventEndAt: context.endAt,
          eventLocation: context.location,
          eventId: context.eventId,
          communitySlug: context.communitySlug,
        });
        const organizerData: NotificationData = {
          ...organizerBase,
          order_id: payment.registration.id,
          participant_display_name: participantDisplayName,
          payment_due_at: params.paymentDueAt ? this.formatJstDateTimeFull(params.paymentDueAt) : '',
          cancelled_at: cancelledAt,
        };
        results.push(
          ...(await this.sendNotification('organizer.payment.expired', organizerRecipient, organizerData, {
            idempotencyKey: payment.id,
          })),
        );
      }
    }

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyEventCancelled(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        locationText: true,
        config: true,
        community: { select: { slug: true } },
        registrations: {
          where: { status: { notIn: ['rejected'] } },
          select: {
            id: true,
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
        },
      },
    });

    if (!event) {
      this.logger.warn(`Event cancel notification skipped: event not found ${eventId}`);
      return { sent: 0 };
    }

    const results: NotificationSendResult[] = [];
    const eventTitle = this.getLocalizedText(event.title) || 'イベント';
    const refundPolicyText = this.resolveRefundPolicyText(event.config);
    for (const registration of event.registrations ?? []) {
      if (!registration.user) continue;
      const recipient = this.buildRecipientFromUser(registration.user);
      const baseData = this.buildBaseNotificationData({
        recipient,
        registrationId: registration.id,
        eventTitle,
        eventStartAt: event.startTime,
        eventEndAt: event.endTime,
        eventLocation: event.locationText,
        eventId: event.id,
        communitySlug: event.community?.slug ?? null,
      });
      const data: NotificationData = {
        ...baseData,
        refund_policy_text: refundPolicyText,
        refund_eta: '',
      };
      results.push(
        ...(await this.sendNotification('user.event.cancelled', recipient, data, {
          idempotencyKey: event.id,
        })),
      );
    }

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyEventChanged(params: {
    eventId: string;
    changeVersion: number;
    before: { title?: string | null; startTime?: Date | null; endTime?: Date | null; locationText?: string | null };
    after: { title?: string | null; startTime?: Date | null; endTime?: Date | null; locationText?: string | null };
  }) {
    const event = await this.prisma.event.findUnique({
      where: { id: params.eventId },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        locationText: true,
        community: { select: { slug: true } },
        registrations: {
          where: { status: { notIn: ['rejected', 'cancelled', 'refunded'] } },
          select: {
            id: true,
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
        },
      },
    });

    if (!event) {
      this.logger.warn(`Event change notification skipped: event not found ${params.eventId}`);
      return { sent: 0 };
    }

    const results: NotificationSendResult[] = [];
    const eventTitle = this.getLocalizedText(event.title) || 'イベント';
    for (const registration of event.registrations ?? []) {
      if (!registration.user) continue;
      const recipient = this.buildRecipientFromUser(registration.user);
      const baseData = this.buildBaseNotificationData({
        recipient,
        registrationId: registration.id,
        eventTitle,
        eventStartAt: event.startTime,
        eventEndAt: event.endTime,
        eventLocation: event.locationText,
        eventId: event.id,
        communitySlug: event.community?.slug ?? null,
      });
      const summary = this.buildEventChangeSummary(params.before, params.after, recipient.locale);
      const beforeBlock = this.buildEventChangeBlock(params.before, recipient.locale);
      const afterBlock = this.buildEventChangeBlock(params.after, recipient.locale);

      const data: NotificationData = {
        ...baseData,
        change_summary: summary,
        before_block: beforeBlock,
        after_block: afterBlock,
      };
      results.push(
        ...(await this.sendNotification('user.event.changed', recipient, data, {
          idempotencyKey: `${event.id}:${params.changeVersion}`,
        })),
      );
    }

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyRefundFailed(params: {
    registrationId: string;
    refundStatus: string;
    requiredActionText?: string;
    actionUrl?: string | null;
    optionalDeadline?: Date | null;
  }) {
    const registration = await this.findRegistrationForNotification(params.registrationId);
    if (!registration || !registration.user || (!registration.event && !registration.lesson)) {
      this.logger.warn(`Refund failed notification skipped: missing data registrationId=${params.registrationId}`);
      return { sent: 0 };
    }

    const recipient = this.buildRecipientFromUser(registration.user);
    const context = this.resolveEventContext(registration);
    const baseData = this.buildBaseNotificationData({
      recipient,
      registrationId: registration.id,
      eventTitle: context.eventTitle,
      eventStartAt: context.startAt,
      eventEndAt: context.endAt,
      eventLocation: context.location,
      eventId: context.eventId,
      communitySlug: context.communitySlug,
    });

    const requiredActionText =
      params.requiredActionText ||
      (recipient.locale === 'zh'
        ? '退款尚未完成，請聯絡客服協助處理。'
        : '返金処理が完了していません。お手数ですがサポートまでご連絡ください。');

    const data: NotificationData = {
      ...baseData,
      refund_status: params.refundStatus,
      required_action_text: requiredActionText,
      action_url: params.actionUrl ?? baseData.order_detail_url,
      optional_deadline: params.optionalDeadline ? this.formatJstDateTimeFull(params.optionalDeadline) : '',
    };

    const results = await this.sendNotification('user.refund.failed', recipient, data, {
      idempotencyKey: registration.id,
    });

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async sendVerificationEmail(params: {
    email: string;
    name?: string | null;
    role: 'participant' | 'organizer';
    verifyCode: string;
    expiresAt?: Date | null;
    locale?: NotificationLocale;
  }) {
    const type: NotificationType =
      params.role === 'organizer' ? 'organizer.email.verify' : 'user.email.verify';
    const template = NOTIFICATION_TEMPLATES[type];
    if (!template) {
      throw new Error('Notification template not found');
    }
    const enabled = await this.isTemplateEnabled(type);
    if (!enabled) {
      throw new BadRequestException('Email verification is disabled');
    }
    const recipient: NotificationRecipient = {
      id: null,
      name: params.name ?? null,
      email: params.email,
      lineUserId: null,
      locale: params.locale ?? 'ja',
    };
    const data: NotificationData = {
      service_name: this.config.serviceName,
      support_url: this.resolveSupportUrl(),
      user_name: recipient.name || 'ゲスト',
      organizer_name: recipient.name || 'ゲスト',
      organizer_email: recipient.email || '',
      verify_code: params.verifyCode,
      expires_at: params.expiresAt ? this.formatJstDateTimeFull(params.expiresAt) : '',
    };
    const rendered = this.renderByChannel(template, recipient.locale, data, 'email');
    if (!rendered) {
      throw new Error('Email template is missing');
    }
    const idempotencyKey = this.buildIdempotencyKey(type, params.verifyCode, recipient.email);
    return this.deliverChannel({
      recipient,
      type,
      category: template.category,
      channel: 'email',
      idempotencyKey,
      content: rendered,
      data,
    });
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
            startTime: true,
            endTime: true,
            locationText: true,
            community: {
              select: {
                id: true,
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
        lesson: {
          select: {
            id: true,
            startAt: true,
            endAt: true,
            class: {
              select: {
                id: true,
                title: true,
                locationName: true,
                community: {
                  select: {
                    id: true,
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
        },
      },
    });

    if (!registration || !registration.user || (!registration.event && !registration.lesson)) {
      this.logger.warn(`Cancel notification skipped: missing data registrationId=${registrationId}`);
      return { sent: 0 };
    }

    const context = this.resolveEventContext(registration);
    const userRecipient = this.buildRecipientFromUser(registration.user);
    const organizerRecipients = await this.resolveOrganizerRecipients(context.communityId);

    const results: NotificationSendResult[] = [];
    results.push(
      ...(await this.sendNotification('user.cancel.success', userRecipient, { eventTitle: context.eventTitle }, {
        idempotencyKey: `user.cancel.success:${registrationId}`,
      })),
    );

    if (organizerRecipients.length) {
      const type = kind === 'paid' ? 'organizer.registration.cancel_paid' : 'organizer.registration.cancel_free';
      const participantDisplayName = this.maskParticipantName(registration.user?.name ?? null);
      const cancelledAt = this.formatJstDateTimeFull(new Date());
      for (const organizerRecipient of organizerRecipients) {
        const organizerBase = this.buildOrganizerBaseNotificationData({
          recipient: organizerRecipient,
          eventTitle: context.eventTitle,
          eventStartAt: context.startAt,
          eventEndAt: context.endAt,
          eventLocation: context.location,
          eventId: context.eventId,
          communitySlug: context.communitySlug,
        });
        const organizerData: NotificationData = {
          ...organizerBase,
          order_id: registration.id,
          participant_display_name: participantDisplayName,
          cancelled_at: cancelledAt,
        };
        results.push(
          ...(await this.sendNotification(type, organizerRecipient, organizerData, {
            idempotencyKey: `${type}:${registrationId}`,
          })),
        );
      }
    }

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyRefundSuccess(params: { registrationId: string; refundAmount?: number | null; refundId?: string | null }) {
    const registration = await this.findRegistrationForNotification(params.registrationId);

    if (!registration || !registration.user || (!registration.event && !registration.lesson)) {
      this.logger.warn(`Refund notification skipped: missing data registrationId=${params.registrationId}`);
      return { sent: 0 };
    }

    const recipient = this.buildRecipientFromUser(registration.user);
    const context = this.resolveEventContext(registration);
    const organizerRecipients = await this.resolveOrganizerRecipients(context.communityId);
    const baseData = this.buildBaseNotificationData({
      recipient,
      registrationId: registration.id,
      eventTitle: context.eventTitle,
      eventStartAt: context.startAt,
      eventEndAt: context.endAt,
      eventLocation: context.location,
      eventId: context.eventId,
      communitySlug: context.communitySlug,
    });

    const refundAmount = formatYen(params.refundAmount ?? registration.amount);
    const data: NotificationData = {
      ...baseData,
      refund_amount: refundAmount,
      refunded_at: this.formatJstDateTimeFull(new Date()),
      settlement_eta: '',
    };
    const key = params.refundId ?? registration.id;

    const results = await this.sendNotification('user.refund.success', recipient, data, {
      idempotencyKey: key,
    });

    if (organizerRecipients.length) {
      const participantDisplayName = this.maskParticipantName(registration.user?.name ?? null);
      const refundedAt = this.formatJstDateTimeFull(new Date());
      for (const organizerRecipient of organizerRecipients) {
        const organizerBase = this.buildOrganizerBaseNotificationData({
          recipient: organizerRecipient,
          eventTitle: context.eventTitle,
          eventStartAt: context.startAt,
          eventEndAt: context.endAt,
          eventLocation: context.location,
          eventId: context.eventId,
          communitySlug: context.communitySlug,
        });
        const organizerData: NotificationData = {
          ...organizerBase,
          order_id: registration.id,
          participant_display_name: participantDisplayName,
          refund_amount: refundAmount,
          refunded_at: refundedAt,
        };
        results.push(
          ...(await this.sendNotification('organizer.refund.occurred', organizerRecipient, organizerData, {
            idempotencyKey: key,
          })),
        );
      }
    }

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
    const range = this.resolveReminderRange(options?.targetDate, 1);
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

  async sendOrganizerEventReminders(options?: { targetDate?: string; dryRun?: boolean }) {
    const range = this.resolveReminderRange(options?.targetDate, 2);
    const events = await this.prisma.event.findMany({
      where: {
        startTime: { gte: range.startUtc, lt: range.endUtc },
        status: 'open',
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
        locationText: true,
        communityId: true,
        community: { select: { slug: true, name: true } },
      },
    });

    if (options?.dryRun) {
      return {
        targetDate: range.dateKey,
        timeZone: this.config.timeZone,
        total: events.length,
        dryRun: true,
      };
    }

    let sent = 0;
    let skipped = 0;

    for (const event of events) {
      const eventTitle = this.getLocalizedText(event.title) || 'イベント';
      const organizerRecipients = await this.resolveOrganizerRecipients(event.communityId);
      if (!organizerRecipients.length) {
        skipped += 1;
        continue;
      }
      for (const organizerRecipient of organizerRecipients) {
        const organizerBase = this.buildOrganizerBaseNotificationData({
          recipient: organizerRecipient,
          eventTitle,
          eventStartAt: event.startTime,
          eventEndAt: event.endTime,
          eventLocation: event.locationText ?? '',
          eventId: event.id,
          communitySlug: event.community?.slug ?? null,
        });
        const results = await this.sendNotification(
          'organizer.event.reminder',
          organizerRecipient,
          organizerBase,
          {
            idempotencyKey: `organizer.event.reminder:${event.id}:${range.dateKey}`,
          },
        );
        const sentCount = results.filter((r) => r.status === 'sent').length;
        sent += sentCount;
        if (!sentCount) skipped += 1;
      }
    }

    return {
      targetDate: range.dateKey,
      timeZone: this.config.timeZone,
      total: events.length,
      sent,
      skipped,
    };
  }

  async notifyOrganizerSettlementEligible(params: {
    hostId: string;
    itemId: string;
    batchId: string;
    settleAmount: number;
    periodFrom: Date;
    periodTo: Date;
  }) {
    const community = await this.prisma.community.findUnique({
      where: { id: params.hostId },
      select: { id: true, name: true, slug: true },
    });
    if (!community) {
      this.logger.warn(`Settlement eligible notification skipped: host not found ${params.hostId}`);
      return { sent: 0 };
    }
    const organizerRecipients = await this.resolveOrganizerRecipients(community.id);
    if (!organizerRecipients.length) {
      return { sent: 0 };
    }
    const eventTitle = community.name || 'イベント';
    const settlementPeriod = `${this.formatJstDateTimeFull(params.periodFrom)} 〜 ${this.formatJstDateTimeFull(
      params.periodTo,
    )}`;
    const results: NotificationSendResult[] = [];

    for (const organizerRecipient of organizerRecipients) {
      const organizerBase = this.buildOrganizerBaseNotificationData({
        recipient: organizerRecipient,
        eventTitle,
        eventId: null,
        communitySlug: community.slug ?? null,
      });
      const organizerData: NotificationData = {
        ...organizerBase,
        settlement_id: params.itemId,
        settlement_amount: formatYen(params.settleAmount),
        settlement_period: settlementPeriod,
        settlement_available_at: this.formatJstDateTimeFull(params.periodTo),
      };
      results.push(
        ...(await this.sendNotification('organizer.settlement.eligible', organizerRecipient, organizerData, {
          idempotencyKey: params.itemId,
        })),
      );
    }

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyOrganizerPayoutSucceeded(params: {
    hostId: string;
    itemId: string;
    payoutAmount: number;
    payoutStatus: string;
    payoutAt: Date;
    transferId?: string | null;
  }) {
    const community = await this.prisma.community.findUnique({
      where: { id: params.hostId },
      select: { id: true, name: true, slug: true },
    });
    if (!community) {
      this.logger.warn(`Payout success notification skipped: host not found ${params.hostId}`);
      return { sent: 0 };
    }
    const organizerRecipients = await this.resolveOrganizerRecipients(community.id);
    if (!organizerRecipients.length) {
      return { sent: 0 };
    }
    const eventTitle = community.name || 'イベント';
    const results: NotificationSendResult[] = [];
    const idempotencyKey = params.transferId ?? params.itemId;

    for (const organizerRecipient of organizerRecipients) {
      const organizerBase = this.buildOrganizerBaseNotificationData({
        recipient: organizerRecipient,
        eventTitle,
        eventId: null,
        communitySlug: community.slug ?? null,
      });
      const organizerData: NotificationData = {
        ...organizerBase,
        settlement_id: params.itemId,
        payout_amount: formatYen(params.payoutAmount),
        payout_at: this.formatJstDateTimeFull(params.payoutAt),
        payout_status: params.payoutStatus,
      };
      results.push(
        ...(await this.sendNotification('organizer.payout.succeeded', organizerRecipient, organizerData, {
          idempotencyKey,
        })),
      );
    }

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyOrganizerPayoutFailed(params: {
    hostId: string;
    itemId: string;
    payoutStatus: string;
    errorMessage?: string | null;
  }) {
    const community = await this.prisma.community.findUnique({
      where: { id: params.hostId },
      select: { id: true, name: true, slug: true },
    });
    if (!community) {
      this.logger.warn(`Payout failed notification skipped: host not found ${params.hostId}`);
      return { sent: 0 };
    }
    const organizerRecipients = await this.resolveOrganizerRecipients(community.id);
    if (!organizerRecipients.length) {
      return { sent: 0 };
    }
    const eventTitle = community.name || 'イベント';
    const results: NotificationSendResult[] = [];

    for (const organizerRecipient of organizerRecipients) {
      const organizerBase = this.buildOrganizerBaseNotificationData({
        recipient: organizerRecipient,
        eventTitle,
        eventId: null,
        communitySlug: community.slug ?? null,
      });
      const organizerData: NotificationData = {
        ...organizerBase,
        settlement_id: params.itemId,
        payout_status: params.payoutStatus,
        payout_hold_reason: params.errorMessage ?? '',
      };
      results.push(
        ...(await this.sendNotification('organizer.payout.failed', organizerRecipient, organizerData, {
          idempotencyKey: `${params.itemId}:${params.payoutStatus}`,
        })),
      );
    }

    return { sent: results.filter((r) => r.status === 'sent').length, results };
  }

  async notifyOrganizerDisputeUpdated(params: {
    paymentId: string;
    disputeId: string;
    disputeStatus: string;
  }) {
    const payment = await this.findPaymentForNotification({ paymentId: params.paymentId });
    if (!payment?.registration || !payment.registration.user) {
      this.logger.warn(`Dispute notification skipped: payment not found ${params.paymentId}`);
      return { sent: 0 };
    }
    const context = this.resolveEventContext(payment.registration);
    const organizerRecipients = await this.resolveOrganizerRecipients(context.communityId);
    if (!organizerRecipients.length) {
      return { sent: 0 };
    }

    const results: NotificationSendResult[] = [];
    for (const organizerRecipient of organizerRecipients) {
      const organizerBase = this.buildOrganizerBaseNotificationData({
        recipient: organizerRecipient,
        eventTitle: context.eventTitle,
        eventStartAt: context.startAt,
        eventEndAt: context.endAt,
        eventLocation: context.location,
        eventId: context.eventId,
        communitySlug: context.communitySlug,
      });
      const organizerData: NotificationData = {
        ...organizerBase,
        order_id: payment.registration.id,
        dispute_status: params.disputeStatus,
        impact_text: this.resolveDisputeImpactText(params.disputeStatus, organizerRecipient.locale),
      };
      results.push(
        ...(await this.sendNotification('organizer.dispute.updated', organizerRecipient, organizerData, {
          idempotencyKey: `${params.disputeId}:${params.disputeStatus}`,
        })),
      );
    }

    return { sent: results.filter((r) => r.status === 'sent').length, results };
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
    const enabled = await this.isTemplateEnabled(type);
    if (!enabled) {
      this.logger.log(`Notification disabled: ${type}`);
      return [] as NotificationSendResult[];
    }

    const resolvedRecipient = await this.resolveRecipientEmail(recipient, template.role);
    const channels = await this.resolveChannels(resolvedRecipient, template.category, options.preferences, type);
    if (!channels.length) {
      return [] as NotificationSendResult[];
    }
    const hydratedData = this.hydrateNotificationData(template.role, resolvedRecipient, data);
    const recipientKey = this.resolveRecipientKey(resolvedRecipient);
    const idempotencyKey = this.buildIdempotencyKey(type, options.idempotencyKey, recipientKey);

    const results: NotificationSendResult[] = [];
    for (const channel of channels) {
      const rendered = this.renderByChannel(template, resolvedRecipient.locale, hydratedData, channel);
      if (!rendered) {
        results.push({ channel, status: 'skipped', errorMessage: 'template_missing' });
        continue;
      }
      results.push(
        await this.deliverChannel({
          recipient: resolvedRecipient,
          type,
          category: template.category,
          channel,
          idempotencyKey,
          content: rendered,
          data: hydratedData,
        }),
      );
    }
    return results;
  }

  private async resolveRecipientEmail(
    recipient: NotificationRecipient,
    role: NotificationRole,
  ): Promise<NotificationRecipient> {
    if (role === 'admin') {
      return {
        ...recipient,
        email: this.config.adminEmail || null,
      };
    }
    if (!recipient.id) {
      return { ...recipient, email: null };
    }
    const contactRole = role === 'organizer' ? 'organizer' : 'participant';
    const contact = await this.prisma.userEmailContact.findUnique({
      where: { userId_role: { userId: recipient.id, role: contactRole } },
      select: { email: true, status: true },
    });
    const email = contact?.status === 'verified' ? contact.email : null;
    return { ...recipient, email };
  }

  private async resolveChannels(
    recipient: NotificationRecipient,
    category: NotificationCategory,
    preferences?: ChannelPreferences,
    type?: NotificationType,
  ) {
    const lineAvailable =
      !this.config.lineNotificationsDisabled && Boolean(recipient.lineUserId) && Boolean(this.config.lineAccessToken);
    const emailAvailable =
      Boolean(recipient.email) && Boolean(this.config.brevoApiKey) && Boolean(this.config.brevoSenderEmail);

    let lineAllowed = lineAvailable;
    let emailAllowed = emailAvailable;

    if (category === 'marketing' && recipient.id) {
      const prefs = preferences ?? (await this.getMarketingPreferences(recipient.id));
      if (prefs.line === false) lineAllowed = false;
      if (prefs.email === false) emailAllowed = false;
    }

    if (emailAllowed) return ['email'] as NotificationChannel[];
    if (lineAllowed) return ['line'] as NotificationChannel[];

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

  private async isTemplateEnabled(type: NotificationType) {
    const template = NOTIFICATION_TEMPLATES[type];
    const defaultEnabled = template?.defaultEnabled ?? true;
    const setting = await this.prisma.notificationTemplateSetting.findUnique({ where: { type } });
    return setting ? setting.enabled : defaultEnabled;
  }

  private resolveRecipientKey(recipient: NotificationRecipient) {
    return recipient.email || recipient.lineUserId || recipient.id || 'unknown';
  }

  private buildIdempotencyKey(type: NotificationType, baseKey: string, recipientKey?: string | null) {
    const parts = [type, baseKey, recipientKey].filter((part) => typeof part === 'string' && part.length > 0);
    return parts.join(':');
  }

  private hydrateNotificationData(
    role: NotificationRole,
    recipient: NotificationRecipient,
    data: NotificationData,
  ): NotificationData {
    const hydrated: NotificationData = { ...data };
    if (!hydrated.service_name) hydrated.service_name = this.config.serviceName;
    if (!hydrated.support_url) hydrated.support_url = this.resolveSupportUrl();

    if (role === 'organizer') {
      if (!hydrated.organizer_name) hydrated.organizer_name = recipient.name || 'ゲスト';
      if (!hydrated.organizer_email) hydrated.organizer_email = recipient.email || '';
      if (!hydrated.organizer_dashboard_url) {
        hydrated.organizer_dashboard_url = this.resolveOrganizerDashboardUrl();
      }
    }
    if (role === 'user') {
      if (!hydrated.user_name) hydrated.user_name = recipient.name || 'ゲスト';
    }
    return hydrated;
  }

  private resolveFrontendBaseUrl() {
    const raw =
      (process.env.FRONTEND_BASE_URL || '').trim() ||
      (process.env.FRONTEND_BASE_URL_LIVE || '').trim() ||
      (process.env.FRONTEND_BASE_URL_UAT || '').trim() ||
      'http://localhost:5173';
    return raw.replace(/\/$/, '');
  }

  private resolveSupportUrl() {
    return this.config.supportUrl || this.resolveFrontendBaseUrl();
  }

  private resolveOrderDetailUrl() {
    return `${this.resolveFrontendBaseUrl()}/me/events`;
  }

  private resolvePaymentUrl() {
    return `${this.resolveFrontendBaseUrl()}/me/payments`;
  }

  private resolveOrganizerDashboardUrl() {
    return '';
  }

  private formatJstDateTimeFull(date: Date | string | null | undefined) {
    if (!date) return '';
    const source = typeof date === 'string' ? new Date(date) : date;
    if (Number.isNaN(source.getTime())) return '';
    const local = new Date(source.getTime() + JST_OFFSET_MS);
    const year = String(local.getUTCFullYear());
    const month = String(local.getUTCMonth() + 1).padStart(2, '0');
    const day = String(local.getUTCDate()).padStart(2, '0');
    const hour = String(local.getUTCHours()).padStart(2, '0');
    const minute = String(local.getUTCMinutes()).padStart(2, '0');
    return `${year}/${month}/${day} ${hour}:${minute}`;
  }

  private formatEventDateTimeRange(startAt: Date | string | null | undefined, endAt: Date | string | null | undefined) {
    const startText = this.formatJstDateTimeFull(startAt);
    if (!startText) return '';
    const endText = this.formatJstDateTimeFull(endAt);
    if (!endText) return startText;
    return `${startText} 〜 ${endText}`;
  }

  private buildBaseNotificationData(params: {
    recipient: NotificationRecipient;
    registrationId: string;
    eventTitle: string;
    eventStartAt?: Date | string | null;
    eventEndAt?: Date | string | null;
    eventLocation?: string | null;
    eventId?: string | null;
    communitySlug?: string | null;
  }): NotificationData {
    const eventUrl = params.eventId
      ? this.resolveEventUrl(params.eventId, params.communitySlug ?? undefined)
      : this.resolveOrderDetailUrl();
    return {
      service_name: this.config.serviceName,
      support_url: this.resolveSupportUrl(),
      user_name: params.recipient.name || 'ゲスト',
      order_id: params.registrationId,
      order_detail_url: this.resolveOrderDetailUrl(),
      event_name: params.eventTitle,
      event_datetime: this.formatEventDateTimeRange(params.eventStartAt ?? null, params.eventEndAt ?? null),
      event_location: params.eventLocation ?? '',
      event_page_url: eventUrl,
      policy_url: eventUrl,
    };
  }

  private buildOrganizerBaseNotificationData(params: {
    recipient: NotificationRecipient;
    eventTitle?: string | null;
    eventStartAt?: Date | string | null;
    eventEndAt?: Date | string | null;
    eventLocation?: string | null;
    eventId?: string | null;
    communitySlug?: string | null;
    eventManageUrl?: string | null;
    orderDetailUrl?: string | null;
    organizerDashboardUrl?: string | null;
  }): NotificationData {
    const eventUrl = params.eventId
      ? this.resolveEventUrl(params.eventId, params.communitySlug ?? undefined)
      : '';
    return {
      service_name: this.config.serviceName,
      support_url: this.resolveSupportUrl(),
      organizer_name: params.recipient.name || 'ゲスト',
      organizer_email: params.recipient.email || '',
      organizer_dashboard_url: params.organizerDashboardUrl ?? this.resolveOrganizerDashboardUrl(),
      event_id: params.eventId ?? '',
      event_name: params.eventTitle ?? '',
      event_datetime: this.formatEventDateTimeRange(params.eventStartAt ?? null, params.eventEndAt ?? null),
      event_location: params.eventLocation ?? '',
      event_manage_url: params.eventManageUrl ?? '',
      event_page_url: eventUrl,
      order_detail_url: params.orderDetailUrl ?? '',
    };
  }

  private resolveEventContext(registration: {
    event?: {
      id?: string | null;
      title?: Prisma.JsonValue | string | null;
      startTime?: Date | string | null;
      endTime?: Date | string | null;
      locationText?: string | null;
      community?: { id?: string | null; slug?: string | null } | null;
    } | null;
    lesson?: {
      startAt?: Date | string | null;
      endAt?: Date | string | null;
      class?: {
        title?: Prisma.JsonValue | string | null;
        locationName?: string | null;
        community?: { id?: string | null; slug?: string | null } | null;
      } | null;
    } | null;
  }) {
    const titleSource = registration.event?.title ?? registration.lesson?.class?.title ?? null;
    const eventTitle = this.getLocalizedText(titleSource) || 'イベント';
    const startAt = registration.event?.startTime ?? registration.lesson?.startAt ?? null;
    const endAt = registration.event?.endTime ?? registration.lesson?.endAt ?? null;
    const location = registration.event?.locationText || registration.lesson?.class?.locationName || '';
    const eventId = registration.event?.id ?? null;
    const community = registration.event?.community ?? registration.lesson?.class?.community ?? null;
    const communityId = community?.id ?? null;
    const communitySlug = community?.slug ?? null;
    return { eventTitle, startAt, endAt, location, eventId, communityId, communitySlug };
  }

  private async resolveOrganizerRecipients(communityId?: string | null) {
    if (!communityId) return [] as NotificationRecipient[];
    const [community, members] = await Promise.all([
      this.prisma.community.findUnique({
        where: { id: communityId },
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
      }),
      this.prisma.communityMember.findMany({
        where: { communityId, role: { in: ['admin', 'organizer'] }, status: 'active' },
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
      }),
    ]);

    const recipients = new Map<string, NotificationRecipient>();
    if (community?.owner) {
      recipients.set(community.owner.id, this.buildRecipientFromUser(community.owner));
    }
    for (const member of members) {
      if (!member.user) continue;
      if (recipients.has(member.user.id)) continue;
      recipients.set(member.user.id, this.buildRecipientFromUser(member.user));
    }
    return Array.from(recipients.values());
  }

  private resolveApplicationStatusText(
    status: string | null | undefined,
    paymentStatus: string | null | undefined,
    amount: number,
    locale: NotificationLocale,
  ) {
    const isZh = locale === 'zh';
    const paidLike = ['paid', 'succeeded', 'captured', 'completed'];
    const paid = paidLike.includes(paymentStatus || '') || status === 'paid' || amount === 0;
    const needsPayment =
      amount > 0 && !paidLike.includes(paymentStatus || '') && ['pending_payment', 'approved'].includes(status || '');
    if (status === 'pending') return isZh ? '等待審核' : '審査待ち';
    if (status === 'rejected') return isZh ? '未通過' : '却下';
    if (needsPayment) return isZh ? '待付款' : '支払い待ち';
    if (paid) return isZh ? '已確認' : '参加確定';
    return isZh ? '處理中' : '確認中';
  }

  private resolveRegistrationNextStepText(
    status: string | null | undefined,
    paymentStatus: string | null | undefined,
    amount: number,
    locale: NotificationLocale,
  ) {
    const isZh = locale === 'zh';
    const paidLike = ['paid', 'succeeded', 'captured', 'completed'];
    const needsPayment =
      amount > 0 && !paidLike.includes(paymentStatus || '') && ['pending_payment', 'approved'].includes(status || '');
    if (status === 'pending') return isZh ? '請等待主辦方審核。' : '主催者の承認をお待ちください。';
    if (status === 'rejected') return isZh ? '很抱歉，本次申請未通過。' : '申し訳ありません。今回の申込は承認されませんでした。';
    if (needsPayment) return isZh ? '請至申請詳情完成付款。' : '申込詳細からお支払いを完了してください。';
    return isZh ? '報名已完成。' : 'お申し込みが完了しました。';
  }

  private resolveApprovalNextStepText(paymentRequired: boolean, locale: NotificationLocale) {
    if (paymentRequired) {
      return locale === 'zh'
        ? '為確保參加資格，請在期限內完成付款。'
        : '参加確定のため、期限までにお支払いを完了してください。';
    }
    return locale === 'zh'
      ? '無需付款，已確認參加。'
      : 'お支払いは不要です。参加が確定しました。';
  }

  private resolvePaymentMethodLabel(method: string | null | undefined, locale: NotificationLocale) {
    if (!method) return '';
    const normalized = method.toLowerCase();
    if (normalized === 'stripe') return locale === 'zh' ? '信用卡' : 'クレジットカード';
    if (normalized === 'mock') return locale === 'zh' ? '測試付款' : 'テスト決済';
    return method;
  }

  private resolveRefundPolicyText(config: unknown): string {
    const parsed = this.parseJsonMaybe(config);
    if (!parsed || typeof parsed !== 'object') return '';
    const text = (parsed as any)?.refundPolicy;
    if (typeof text === 'string' && text.trim()) return text.trim();
    return '';
  }

  private resolveDisputeImpactText(status: string | null | undefined, locale: NotificationLocale) {
    const isZh = locale === 'zh';
    const normalized = (status || '').toLowerCase();
    if (normalized === 'won') {
      return isZh ? '爭議已解決，結算將恢復。' : '争議は解決済みです。結算が再開されます。';
    }
    if (normalized === 'lost') {
      return isZh ? '拒付已確定，結算將調整或保留。' : '争議が確定し、結算の調整が行われます。';
    }
    return isZh ? '結算可能會受到影響。' : '結算に影響する可能性があります。';
  }

  private maskParticipantName(value: string | null | undefined) {
    const trimmed = (value || '').trim();
    if (!trimmed) return '';
    if (trimmed.length <= 1) return trimmed;
    return `${trimmed.slice(0, 1)}***`;
  }

  private buildEventChangeSummary(
    before: { title?: string | null; startTime?: Date | null; endTime?: Date | null; locationText?: string | null },
    after: { title?: string | null; startTime?: Date | null; endTime?: Date | null; locationText?: string | null },
    locale: NotificationLocale,
  ) {
    const isZh = locale === 'zh';
    const lines: string[] = [];
    const beforeDate = this.formatEventDateTimeRange(before.startTime ?? null, before.endTime ?? null);
    const afterDate = this.formatEventDateTimeRange(after.startTime ?? null, after.endTime ?? null);
    if (beforeDate && afterDate && beforeDate !== afterDate) {
      lines.push(`${isZh ? '時間' : '日時'}: ${beforeDate} → ${afterDate}`);
    }
    const beforeLocation = (before.locationText ?? '').trim();
    const afterLocation = (after.locationText ?? '').trim();
    if (beforeLocation !== afterLocation) {
      lines.push(`${isZh ? '地點' : '場所'}: ${beforeLocation || '—'} → ${afterLocation || '—'}`);
    }
    const beforeTitle = (before.title ?? '').trim();
    const afterTitle = (after.title ?? '').trim();
    if (beforeTitle !== afterTitle) {
      lines.push(`${isZh ? '標題' : 'タイトル'}: ${beforeTitle || '—'} → ${afterTitle || '—'}`);
    }
    return lines.length ? lines.join('\n') : isZh ? '內容已更新' : '内容が更新されました';
  }

  private buildEventChangeBlock(
    value: { title?: string | null; startTime?: Date | null; endTime?: Date | null; locationText?: string | null },
    locale: NotificationLocale,
  ) {
    const isZh = locale === 'zh';
    const lines: string[] = [];
    if (value.title) lines.push(`${isZh ? '標題' : 'タイトル'}: ${value.title}`);
    const dateText = this.formatEventDateTimeRange(value.startTime ?? null, value.endTime ?? null);
    if (dateText) lines.push(`${isZh ? '時間' : '日時'}: ${dateText}`);
    if (value.locationText) lines.push(`${isZh ? '地點' : '場所'}: ${value.locationText}`);
    return lines.length ? lines.join('\n') : '—';
  }

  private parseJsonMaybe(value: unknown) {
    if (!value) return null;
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    if (typeof value === 'object') return value;
    return null;
  }

  private async findRegistrationForNotification(registrationId: string) {
    return this.prisma.eventRegistration.findUnique({
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
        payment: {
          select: {
            id: true,
            method: true,
            createdAt: true,
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
            endTime: true,
            locationText: true,
            community: {
              select: {
                id: true,
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
        lesson: {
          select: {
            id: true,
            startAt: true,
            endAt: true,
            class: {
              select: {
                id: true,
                title: true,
                locationName: true,
                community: {
                  select: {
                    id: true,
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
        },
      },
    });
  }

  private async findPaymentForNotification(params: { paymentId?: string | null; registrationId?: string | null }) {
    const registrationInclude = {
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
          endTime: true,
          locationText: true,
          community: { select: { id: true, slug: true } },
        },
      },
      lesson: {
        select: {
          id: true,
          startAt: true,
          endAt: true,
          class: {
            select: {
              id: true,
              title: true,
              locationName: true,
              community: { select: { id: true, slug: true } },
            },
          },
        },
      },
    };
    if (params.paymentId) {
      return this.prisma.payment.findUnique({
        where: { id: params.paymentId },
        include: { registration: { include: registrationInclude } },
      });
    }
    if (params.registrationId) {
      return this.prisma.payment.findFirst({
        where: { registrationId: params.registrationId },
        include: { registration: { include: registrationInclude } },
      });
    }
    return null;
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
      email: null,
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
    const base = this.resolveFrontendBaseUrl();
    if (communitySlug) {
      return `${base}/events/${eventId}`;
    }
    return `${base}/events/${eventId}`;
  }

  private resolveReminderRange(targetDate?: string, daysAhead: number = 1) {
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
    const day = jstNow.getUTCDate() + Math.max(0, daysAhead || 1);
    const startUtc = new Date(Date.UTC(year, month, day, 0, 0, 0) - JST_OFFSET_MS);
    const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
    const dateKey = `${String(year)}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { startUtc, endUtc, dateKey };
  }
}
