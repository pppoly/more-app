/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-floating-promises, @typescript-eslint/unbound-method */
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
