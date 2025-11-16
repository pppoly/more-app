import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CommunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySlug(slug: string) {
    const community = await this.prisma.community.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        coverImageUrl: true,
        labels: true,
        visibleLevel: true,
        events: {
          where: {
            visibility: 'public',
            status: 'open',
          },
          orderBy: {
            startTime: 'desc',
          },
          take: 3,
          select: {
            id: true,
            startTime: true,
            locationText: true,
            status: true,
            title: true,
          },
        },
      },
    });

    if (!community) {
      throw new NotFoundException('Community not found');
    }

    return community;
  }
}
