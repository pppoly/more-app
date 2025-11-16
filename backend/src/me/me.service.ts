import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyEvents(userId: string) {
    const registrations = await this.prisma.eventRegistration.findMany({
      where: {
        userId,
        NOT: { status: 'cancelled' },
      },
      orderBy: {
        event: {
          startTime: 'asc',
        },
      },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        amount: true,
        attended: true,
        noShow: true,
        event: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            locationText: true,
            title: true,
            community: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
      },
    });

    return registrations.map((registration) => ({
      registrationId: registration.id,
      status: registration.status,
      paymentStatus: registration.paymentStatus,
      amount: registration.amount,
      attended: registration.attended,
      noShow: registration.noShow,
      event: registration.event,
    }));
  }
}
