import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async createMockPayment(userId: string, registrationId: string) {
    const registration = await this.prisma.eventRegistration.findUnique({
      where: { id: registrationId },
      select: {
        id: true,
        userId: true,
        eventId: true,
        amount: true,
        paymentStatus: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('Registration not found');
    }

    if (registration.userId !== userId) {
      throw new ForbiddenException('You cannot pay for this registration');
    }

    if (registration.paymentStatus === 'paid') {
      throw new BadRequestException('Registration already paid');
    }

    const amount = registration.amount ?? 0;

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        eventId: registration.eventId,
        amount,
        method: 'mock',
        platformFee: 0,
        status: 'paid',
        transactionId: `mock-${registrationId}-${Date.now()}`,
      },
      select: {
        id: true,
        status: true,
        amount: true,
      },
    });

    await this.prisma.eventRegistration.update({
      where: { id: registrationId },
      data: {
        status: 'paid',
        paidAmount: amount,
        paymentStatus: 'paid',
      },
    });

    return {
      paymentId: payment.id,
      status: payment.status,
      amount: payment.amount,
      registrationId,
    };
  }
}
