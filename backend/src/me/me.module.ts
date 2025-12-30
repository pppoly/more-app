import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { AssetModule } from '../asset/asset.module';
import { NotificationModule } from '../notifications/notification.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [AssetModule, NotificationModule, PaymentsModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
