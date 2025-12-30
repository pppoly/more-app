import { NotificationTemplate, NotificationType } from './notification.types';

export const NOTIFICATION_TEMPLATES: Record<NotificationType, NotificationTemplate> = {
  'organizer.registration.success': {
    role: 'organizer',
    category: 'transactional',
    line: {
      ja: {
        title: '新しい申込',
        body: '{{eventTitle}} に {{userName}} さんが申し込みました。{{ticketName}} {{amountText}}',
      },
    },
    email: {
      ja: {
        subject: '新しい申込が入りました',
        body: '{{eventTitle}} に {{userName}} さんが申し込みました。\n{{ticketName}} {{amountText}}',
      },
    },
  },
  'organizer.registration.cancel_free': {
    role: 'organizer',
    category: 'transactional',
    line: {
      ja: {
        title: 'キャンセルが入りました',
        body: '{{eventTitle}} の申込がキャンセルされました（無料）。',
      },
    },
    email: {
      ja: {
        subject: '申込がキャンセルされました',
        body: '{{eventTitle}} の申込がキャンセルされました（無料）。',
      },
    },
  },
  'organizer.registration.cancel_paid': {
    role: 'organizer',
    category: 'transactional',
    line: {
      ja: {
        title: '返金対応が必要です',
        body: '{{eventTitle}} の申込がキャンセルされました。返金対応をお願いします。',
      },
    },
    email: {
      ja: {
        subject: '返金対応が必要なキャンセルがあります',
        body: '{{eventTitle}} の申込がキャンセルされました。返金対応をお願いします。',
      },
    },
  },
  'user.community.event_published': {
    role: 'user',
    category: 'marketing',
    line: {
      ja: {
        title: '{{communityName}} の新しいイベント',
        body: '{{eventTitle}} が公開されました。',
      },
    },
    email: {
      ja: {
        subject: '{{communityName}} の新しいイベントが公開されました',
        body: '{{eventTitle}} が公開されました。詳細はこちら: {{url}}',
      },
    },
  },
  'user.registration.success': {
    role: 'user',
    category: 'transactional',
    line: {
      ja: {
        title: '申込が完了しました',
        body: '{{eventTitle}}\n{{eventDate}} {{eventTime}}\n{{location}}',
      },
    },
    email: {
      ja: {
        subject: '申込が完了しました',
        body: '{{eventTitle}}\n{{eventDate}} {{eventTime}}\n{{location}}',
      },
    },
  },
  'user.refund.success': {
    role: 'user',
    category: 'transactional',
    line: {
      ja: {
        title: '返金が完了しました',
        body: '{{eventTitle}} の返金が完了しました。返金額: {{refundAmount}}',
      },
    },
    email: {
      ja: {
        subject: '返金が完了しました',
        body: '{{eventTitle}} の返金が完了しました。返金額: {{refundAmount}}',
      },
    },
  },
  'user.cancel.success': {
    role: 'user',
    category: 'transactional',
    line: {
      ja: {
        title: 'キャンセルが完了しました',
        body: '{{eventTitle}} の申込をキャンセルしました。',
      },
    },
    email: {
      ja: {
        subject: 'キャンセルが完了しました',
        body: '{{eventTitle}} の申込をキャンセルしました。',
      },
    },
  },
  'user.event.reminder': {
    role: 'user',
    category: 'transactional',
    line: {
      ja: {
        title: '明日イベントがあります',
        body: '{{eventTitle}}\n{{eventDate}} {{eventTime}}\n{{location}}',
      },
    },
    email: {
      ja: {
        subject: '明日イベントがあります',
        body: '{{eventTitle}}\n{{eventDate}} {{eventTime}}\n{{location}}',
      },
    },
  },
  'admin.system.alert': {
    role: 'admin',
    category: 'operational',
    line: {
      ja: {
        title: 'システムアラート',
        body: '{{message}}',
      },
    },
    email: {
      ja: {
        subject: 'システムアラート',
        body: '{{message}}',
      },
    },
  },
  'admin.business.alert': {
    role: 'admin',
    category: 'operational',
    line: {
      ja: {
        title: 'ビジネスアラート',
        body: '{{message}}',
      },
    },
    email: {
      ja: {
        subject: 'ビジネスアラート',
        body: '{{message}}',
      },
    },
  },
  'admin.notification.alert': {
    role: 'admin',
    category: 'operational',
    line: {
      ja: {
        title: '通知システムアラート',
        body: '{{message}}',
      },
    },
    email: {
      ja: {
        subject: '通知システムアラート',
        body: '{{message}}',
      },
    },
  },
};
