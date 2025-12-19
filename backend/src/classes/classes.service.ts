import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto, UpdateClassDto } from './dto/create-class.dto';
import { BatchCreateLessonsDto } from './dto/create-lessons.dto';
import { CreateClassRegistrationDto } from './dto/create-registration.dto';
import { PaymentsService } from '../payments/payments.service';

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsService: PaymentsService,
  ) {}

  private getLocalizedText(content: Prisma.JsonValue | string | null | undefined) {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (typeof content === 'object') {
      const record = content as Record<string, any>;
      if (typeof record.original === 'string') {
        return record.original;
      }
      const ja = record.ja ?? record['ja-JP'];
      if (typeof ja === 'string') return ja;
    }
    return '';
  }

  async listCommunityClasses(communityId: string) {
    const classes = await this.prisma.class.findMany({
      where: { communityId, status: { not: 'archived' } },
      orderBy: { createdAt: 'desc' },
      include: {
        lessons: {
          where: { status: 'scheduled', startAt: { gte: new Date() } },
          orderBy: { startAt: 'asc' },
          take: 1,
        },
      },
    });
    return classes.map((cls) => {
      const nextLesson = cls.lessons[0] ?? null;
      const { lessons, ...rest } = cls;
      return {
        ...rest,
        nextLesson,
        title: this.getLocalizedText(cls.title),
        description: this.getLocalizedText(cls.description),
      };
    });
  }

  async getClassDetail(classId: string) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        community: { select: { id: true, name: true, slug: true } },
        lessons: {
          where: { status: 'scheduled', startAt: { gte: new Date() } },
          orderBy: { startAt: 'asc' },
          take: 20,
        },
      },
    });
    if (!cls) throw new NotFoundException('Class not found');
    const { lessons, ...rest } = cls;
    return {
      ...rest,
      title: this.getLocalizedText(cls.title),
      description: this.getLocalizedText(cls.description),
      upcomingLessons: lessons,
    };
  }

  async createRegistration(classId: string, userId: string, dto: CreateClassRegistrationDto) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
      include: {
        class: { include: { community: true } },
        registrations: {
          where: { status: { in: ['paid', 'approved'] } },
          select: { id: true },
        },
      },
    });
    if (!lesson || lesson.classId !== classId) {
      throw new NotFoundException('Lesson not found');
    }
    if (lesson.status === 'cancelled') {
      throw new BadRequestException('この回はキャンセルされています');
    }
    if (lesson.startAt < new Date()) {
      throw new BadRequestException('開始済みの回には申込できません');
    }

    const communityId = lesson.class.communityId;
    await this.ensureActiveMembership(communityId, userId);

    const existing = await this.prisma.eventRegistration.findFirst({
      where: { lessonId: lesson.id, userId, NOT: { status: 'cancelled' } },
      include: {
        lesson: true,
      },
    });
    if (existing) {
      return {
        registrationId: existing.id,
        status: existing.status,
        paymentStatus: existing.paymentStatus ?? 'paid',
        paymentRequired: existing.paymentStatus !== 'paid',
        amount: existing.amount ?? 0,
        lessonId: existing.lessonId,
      };
    }

    // Capacity check
    const capacity = lesson.capacity ?? lesson.class.defaultCapacity ?? null;
    if (capacity && lesson.registrations.length >= capacity) {
      throw new BadRequestException('この回は満席です');
    }

    const price = lesson.class.priceYenPerLesson ?? 0;
    const isFree = price <= 0;
    const initialStatus = isFree ? 'paid' : 'approved';
    const initialPaymentStatus = isFree ? 'paid' : 'unpaid';

    try {
      const registration = await this.prisma.eventRegistration.create({
        data: {
          lessonId: lesson.id,
          eventId: null,
          ticketTypeId: null,
          userId,
          status: initialStatus,
          formAnswers: dto.formAnswers ?? Prisma.JsonNull,
          amount: price,
          paidAmount: isFree ? price : 0,
          paymentStatus: initialPaymentStatus,
        },
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          amount: true,
        },
      });
      return {
        registrationId: registration.id,
        status: registration.status,
        paymentStatus: registration.paymentStatus,
        paymentRequired: !isFree,
        amount: registration.amount,
        lessonId: lesson.id,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('既にこの回に申込済みです');
      }
      throw error;
    }
  }

  private async ensureActiveMembership(communityId: string, userId: string) {
    const member = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });
    if (member && member.status === 'blocked') {
      throw new ForbiddenException('コミュニティの参加がブロックされています');
    }
    if (!member) {
      await this.prisma.communityMember.create({
        data: {
          communityId,
          userId,
          role: 'member',
          status: 'active',
        },
      });
    }
  }

  // Console side
  async listConsoleClasses(userId: string) {
    const communities = await this.prisma.communityMember.findMany({
      where: { userId, role: { in: ['owner', 'admin', 'organizer'] } },
      select: { communityId: true },
    });
    const communityIds = communities.map((c) => c.communityId);
    const classes = await this.prisma.class.findMany({
      where: { communityId: { in: communityIds }, status: { not: 'archived' } },
      orderBy: { updatedAt: 'desc' },
      include: {
        lessons: {
          where: { status: 'scheduled', startAt: { gte: new Date() } },
          orderBy: { startAt: 'asc' },
        },
      },
    });
    return classes.map((cls) => ({
      ...cls,
      title: this.getLocalizedText(cls.title),
      description: this.getLocalizedText(cls.description),
      futureLessonCount: cls.lessons.length,
    }));
  }

  async createClass(userId: string, dto: CreateClassDto) {
    const community = await this.prisma.communityMember.findFirst({
      where: { userId, role: { in: ['owner', 'admin', 'organizer'] } },
      select: { communityId: true, joinedAt: true },
      orderBy: { joinedAt: 'asc' },
    });
    if (!community) throw new ForbiddenException('コミュニティ権限がありません');
    const title = { original: dto.title };
    const description = dto.description ? { original: dto.description } : undefined;
    return this.prisma.class.create({
      data: {
        communityId: community.communityId,
        title,
        description,
        locationName: dto.locationName,
        priceYenPerLesson: dto.priceYenPerLesson,
        defaultCapacity: dto.defaultCapacity ?? null,
      },
    });
  }

  async updateClass(userId: string, classId: string, dto: UpdateClassDto) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('Class not found');
    await this.assertCommunityManager(userId, cls.communityId);
    const data: Prisma.ClassUpdateInput = {};
    if (dto.title !== undefined) data.title = { original: dto.title };
    if (dto.description !== undefined) data.description = dto.description ? { original: dto.description } : Prisma.JsonNull;
    if (dto.locationName !== undefined) data.locationName = dto.locationName;
    if (dto.priceYenPerLesson !== undefined) data.priceYenPerLesson = dto.priceYenPerLesson;
    if (dto.defaultCapacity !== undefined) data.defaultCapacity = dto.defaultCapacity;
    if (dto.status !== undefined) data.status = dto.status;
    return this.prisma.class.update({ where: { id: classId }, data });
  }

  async deleteClass(userId: string, classId: string) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('Class not found');
    await this.assertCommunityManager(userId, cls.communityId);
    await this.prisma.lesson.updateMany({
      where: { classId },
      data: { status: 'archived' },
    });
    return this.prisma.class.update({
      where: { id: classId },
      data: { status: 'archived' },
    });
  }

  async batchCreateLessons(userId: string, classId: string, dto: BatchCreateLessonsDto) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls) throw new NotFoundException('Class not found');
    await this.assertCommunityManager(userId, cls.communityId);
    const records = dto.lessons.map((lesson) => ({
      classId,
      startAt: new Date(lesson.startAt),
      endAt: lesson.endAt ? new Date(lesson.endAt) : null,
      capacity: lesson.capacity ?? cls.defaultCapacity ?? null,
      status: 'scheduled',
    }));
    return this.prisma.lesson.createMany({ data: records });
  }

  async cancelLesson(userId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { class: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCommunityManager(userId, lesson.class.communityId);
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: { status: 'cancelled' },
    });
  }

  async deleteLesson(userId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { class: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCommunityManager(userId, lesson.class.communityId);
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: { status: 'archived' },
    });
  }

  async getLessonRegistrations(userId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        class: true,
        registrations: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCommunityManager(userId, lesson.class.communityId);
    return lesson.registrations.map((reg) => ({
      id: reg.id,
      status: reg.status,
      paymentStatus: reg.paymentStatus,
      amount: reg.amount,
      user: reg.user,
      createdAt: reg.createdAt,
    }));
  }

  async getLessonPaymentSummary(userId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { class: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    await this.assertCommunityManager(userId, lesson.class.communityId);
    const registrationCount = await this.prisma.eventRegistration.count({
      where: { lessonId, status: { not: 'cancelled' } },
    });
    const payments = await this.prisma.payment.findMany({
      where: { lessonId, status: { in: ['paid', 'refunded', 'succeeded', 'captured'] } },
      select: { amount: true, status: true },
    });
    const total = payments.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    return { lessonId, totalAmount: total, count: registrationCount };
  }

  private async assertCommunityManager(userId: string, communityId: string) {
    const member = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });
    if (!member || !['owner', 'admin', 'organizer'].includes(member.role)) {
      throw new ForbiddenException('権限がありません');
    }
  }
}
