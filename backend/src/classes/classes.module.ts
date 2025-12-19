import { Module } from '@nestjs/common';
import { ClassesController } from './classes.controller';
import { ClassesConsoleController } from './classes.console.controller';
import { ClassesService } from './classes.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [PrismaModule, PaymentsModule],
  controllers: [ClassesController, ClassesConsoleController],
  providers: [ClassesService],
  exports: [ClassesService],
})
export class ClassesModule {}
