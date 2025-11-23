import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

export interface FetchMessagesParams {
  lang: string;
  namespace?: string | string[];
  sinceVersion?: number;
}

@Injectable()
export class I18nService {
  constructor(private readonly prisma: PrismaService) {}

  async fetchMessages(params: FetchMessagesParams) {
    const namespaces = Array.isArray(params.namespace)
      ? params.namespace
      : params.namespace
      ? [params.namespace]
      : undefined;

    const messages = await this.prisma.i18nMessage.findMany({
      where: {
        lang: params.lang,
        ...(namespaces ? { namespace: { in: namespaces } } : {}),
        ...(params.sinceVersion ? { version: { gt: params.sinceVersion } } : {}),
      },
      orderBy: [{ namespace: 'asc' }, { key: 'asc' }],
    });

    const maxVersion =
      messages.reduce((max: number, item) => {
        return item.version && item.version > max ? item.version : max;
      }, params.sinceVersion ?? 0) || 0;

    const payload: Record<string, string> = {};
    messages.forEach((item) => {
      const compositeKey = `${item.namespace}.${item.key}`;
      payload[compositeKey] = item.text;
    });

    return { version: maxVersion, messages: payload };
  }
}
