import { Module } from '@nestjs/common';
import { ClassesController } from './classes.controller';
import { ClassesConsoleController } from './classes.console.controller';
import { ClassesService } from './classes.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { AssetModule } from '../asset/asset.module';

@Module({
  imports: [PrismaModule, PaymentsModule, AssetModule],
  controllers: [ClassesController, ClassesConsoleController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
