import { Controller, Get, Query } from '@nestjs/common';
import { I18nService } from './i18n.service';

@Controller('i18n')
export class I18nController {
  constructor(private readonly i18nService: I18nService) {}

  @Get('messages')
  async getMessages(
    @Query('lang') lang = 'ja',
    @Query('namespace') namespace?: string | string[],
    @Query('sinceVersion') sinceVersion?: string,
  ) {
    const versionNum = sinceVersion ? Number(sinceVersion) : undefined;
    const data = await this.i18nService.fetchMessages({
      lang,
      namespace,
      sinceVersion: Number.isFinite(versionNum) ? versionNum : undefined,
    });
    return data;
  }
}
