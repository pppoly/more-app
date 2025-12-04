import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { AssetModule } from '../asset/asset.module';

@Module({
  imports: [AssetModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
