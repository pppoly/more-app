/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument */
import { Body, Controller, Post } from '@nestjs/common';
import { MeService } from './me.service';

@Controller()
export class EmailPublicController {
  constructor(private readonly meService: MeService) {}

  @Post('notifications/brevo/webhook')
  handleBrevoWebhook(@Body() body: any) {
    return this.meService.processBrevoWebhook(body);
  }
}
