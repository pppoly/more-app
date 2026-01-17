import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { getPaymentsConfig } from './payments.config';
import { SettlementService } from './settlement.service';

type TimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

@Injectable()
export class SettlementSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SettlementSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private lastRunKey: string | null = null;

  constructor(private readonly settlementService: SettlementService) {}

  onModuleInit() {
    const config = getPaymentsConfig();
    if (!config.settlementAutoRunEnabled) return;
    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        this.logger.error(
          `[settlement] auto-run tick failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, 60_000);
  }

  onModuleDestroy() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private getTimeParts(date: Date, timeZone: string): TimeParts {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return {
      year: pick('year'),
      month: pick('month'),
      day: pick('day'),
      hour: pick('hour'),
      minute: pick('minute'),
      second: pick('second'),
    };
  }

  private zonedTimeToUtc(parts: TimeParts, timeZone: string) {
    const utcGuess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
    const guessedLocal = this.getTimeParts(utcGuess, timeZone);
    const guessedLocalAsUtc = Date.UTC(
      guessedLocal.year,
      guessedLocal.month - 1,
      guessedLocal.day,
      guessedLocal.hour,
      guessedLocal.minute,
      guessedLocal.second,
    );
    const desiredLocalAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const diffMs = guessedLocalAsUtc - desiredLocalAsUtc;
    return new Date(utcGuess.getTime() - diffMs);
  }

  private async tick() {
    const config = getPaymentsConfig();
    if (!config.settlementAutoRunEnabled) return;

    const now = new Date();
    const timeZone = config.settlementTimeZone;
    const localNow = this.getTimeParts(now, timeZone);
    const scheduledUtc = this.zonedTimeToUtc(
      {
        year: localNow.year,
        month: localNow.month,
        day: localNow.day,
        hour: config.settlementAutoRunHour,
        minute: config.settlementAutoRunMinute,
        second: 0,
      },
      timeZone,
    );

    if (now < scheduledUtc) return;

    const runKey = scheduledUtc.toISOString();
    if (this.lastRunKey === runKey) return;
    this.lastRunKey = runKey;

    const periodTo = scheduledUtc;
    const windowDays = Math.max(1, config.settlementWindowDays);
    const periodFrom = new Date(periodTo.getTime() - windowDays * 24 * 60 * 60 * 1000);

    const result = await this.settlementService.runSettlementBatch({
      periodFrom,
      periodTo,
      trigger: { type: 'auto' },
    });
    this.logger.log(
      `[settlement] auto-run completed: batch=${result.batchId} status=${result.status} periodTo=${periodTo.toISOString()}`,
    );
  }
}

