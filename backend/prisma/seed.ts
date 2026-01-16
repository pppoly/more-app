import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const multiText = (ja: string, zh: string, en: string): Prisma.JsonObject => ({
  original: ja,
  ja,
  zh,
  en,
});

const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000);

async function createEventWithTickets(communityId: string, config: {
  title: Prisma.JsonObject;
  description: Prisma.JsonObject;
  startTime: Date;
  endTime: Date;
  status: string;
  locationText: string;
  visibility?: string;
  tickets: Array<{ name: Prisma.JsonObject; type: string; price: number; quota?: number | null }>;
}) {
  const event = await prisma.event.create({
    data: {
      communityId,
      title: config.title,
      description: config.description,
      originalLanguage: 'ja',
      startTime: config.startTime,
      endTime: config.endTime,
      regDeadline: new Date(config.startTime.getTime() - 60 * 60 * 1000),
      locationText: config.locationText,
      maxParticipants: 40,
      visibility: config.visibility ?? 'public',
      requireApproval: false,
      status: config.status,
    },
  });

  const tickets = [];
  for (const ticket of config.tickets) {
    const created = await prisma.eventTicketType.create({
      data: {
        eventId: event.id,
        name: ticket.name,
        type: ticket.type,
        price: ticket.price,
        quota: ticket.quota ?? 50,
      },
    });
    tickets.push(created);
  }

  return { event, tickets };
}

async function createRegistration(options: {
  eventId: string;
  userId: string;
  ticketTypeId: string;
  paid?: boolean;
  attended?: boolean;
  noShow?: boolean;
}) {
  const event = await prisma.event.findUnique({ where: { id: options.eventId }, select: { communityId: true } });
  const ticket = await prisma.eventTicketType.findUnique({ where: { id: options.ticketTypeId } });
  const amount = ticket?.price ?? 0;

  const registration = await prisma.eventRegistration.create({
    data: {
      eventId: options.eventId,
      userId: options.userId,
      ticketTypeId: options.ticketTypeId,
      status: options.paid ? 'paid' : 'approved',
      formAnswers: {},
      amount,
      paidAmount: options.paid ? amount : 0,
      paymentStatus: options.paid ? 'paid' : 'unpaid',
      attended: Boolean(options.attended),
      noShow: Boolean(options.noShow),
    },
  });

  if (options.paid && amount >= 0) {
    await prisma.payment.create({
      data: {
        userId: options.userId,
        eventId: options.eventId,
        communityId: event?.communityId,
        registrationId: registration.id,
        amount,
        method: 'mock',
        chargeModel: 'platform_charge',
        platformFee: 0,
        currency: 'jpy',
        status: 'paid',
      },
    });
  }

  if (options.attended) {
    await prisma.eventCheckin.create({
      data: {
        eventId: options.eventId,
        registrationId: registration.id,
        checkinType: 'qr',
      },
    });
  }

  return registration;
}

async function main() {
  await prisma.payment.deleteMany();
  await prisma.eventCheckin.deleteMany();
  await prisma.eventRegistration.deleteMany();
  await prisma.eventTicketType.deleteMany();
  await prisma.event.deleteMany();
  await prisma.communityMember.deleteMany();
  await prisma.community.deleteMany();
  await prisma.feePolicy.deleteMany();
  await prisma.pricingPlan.deleteMany();
  await prisma.organizerApplication.deleteMany();
  await prisma.user.deleteMany();

  const starterPlan = await prisma.pricingPlan.create({
    data: {
      id: 'starter',
      name: 'Starter',
      monthlyFee: 0,
      transactionFeePercent: 5,
      transactionFeeFixed: 0,
      payoutSchedule: 'manual',
      features: { support: ['basic'] },
    },
  });

  await prisma.feePolicy.create({
    data: {
      pricingPlanId: starterPlan.id,
      percent: 5,
      fixed: 0,
    },
  });

  const ownerA = await prisma.user.create({
    data: { name: '三鷹 多文化ママ', language: 'ja', prefecture: 'Tokyo' },
  });
  const ownerB = await prisma.user.create({
    data: { name: '东京多文化社区', language: 'zh', prefecture: 'Tokyo' },
  });
  const ownerC = await prisma.user.create({
    data: { name: 'TCOC Organizer', language: 'en', prefecture: 'Tokyo' },
  });

  const guests = await Promise.all(
    [
      { name: '熊谷 さくら', language: 'ja' },
      { name: 'Liang Chen', language: 'zh' },
      { name: 'Emily Brown', language: 'en' },
      { name: '森本 ハルカ', language: 'ja' },
    ].map((guest) =>
      prisma.user.create({
        data: { name: guest.name, language: guest.language, prefecture: 'Tokyo' },
      }),
    ),
  );

  const communityKids = await prisma.community.create({
    data: {
      name: '武蔵野 多文化親子探索会',
      slug: 'musashino-kids',
      ownerId: ownerA.id,
      pricingPlanId: starterPlan.id,
      visibleLevel: 'public',
      labels: ['親子', '多文化', '自然'],
      description: multiText(
        '武蔵野エリアで親子が自然や多文化に触れ合うサークルです。',
        '在武藏野与孩子一起亲近自然、体验多文化。',
        'Exploring nature and cultures with kids around Musashino.',
      ),
      language: 'ja',
    },
  });

  const communityLanguage = await prisma.community.create({
    data: {
      name: 'Tokyo Language & Culture Lounge',
      slug: 'tokyo-language-exchange',
      ownerId: ownerB.id,
      pricingPlanId: starterPlan.id,
      visibleLevel: 'public',
      labels: ['言語交換', '国際交流'],
      description: multiText(
        '世界中の言葉と文化を楽しむ交流コミュニティ。',
        '东京语言交换社群，结交世界朋友。',
        'Language exchange and cultural meetups in Tokyo.',
      ),
      language: 'ja',
    },
  });

  const tcocAboutEn =
    'Connect. Collaborate. Create.\n\nWelcome to Tokyo Community Organizations Meetup Group — a hub for people who build, support, and connect communities across Tokyo. From neighborhood associations and cultural groups to NPOs, startups, and social innovators, this is where collaboration begins.\n\nWe host regular meetups, open discussions, and showcase sessions that explore:\n• Community engagement and social design in Japan\n• Cross-cultural collaboration and inclusion\n• Event management, fundraising, and digital tools for NPOs\n• Local government partnerships and sustainability initiatives\n\nWhether you’re leading a local project, volunteering, or just curious about social impact in Tokyo — you’ll find inspiration, connections, and real opportunities to make things happen.';
  const tcocAboutJa =
    'Connect. Collaborate. Create.\n\nTokyo Community Organizations Meetup Group は、東京でコミュニティをつくり、支え、つなぐ人のためのハブです。町会や文化団体、NPO、スタートアップ、ソーシャルイノベーターまで、ここから協働が始まります。\n\n定期的なミートアップやオープンディスカッション、ショーケースでは次のテーマを探究します。\n・日本におけるコミュニティエンゲージメントとソーシャルデザイン\n・多文化協働とインクルーシブな場づくり\n・NPOのためのイベント運営、資金調達、デジタルツール\n・自治体との連携やサステナビリティの取り組み\n\n地域プロジェクトを率いる人、ボランティア、東京の社会的インパクトに興味がある人など、誰もが刺激と仲間、そして実行の機会を見つけられます。';
  const tcocAboutZh =
    '连接 · 协作 · 共创。\n\nTokyo Community Organizations Meetup Group 是汇聚东京各类社区组织的枢纽。从街区协会、文化团体到 NPO、初创团队与社会创新者，协作在此起步。\n\n我们定期举办聚会、开放讨论与展示，聚焦以下主题：\n• 日本的社区参与与社会设计\n• 跨文化协作与包容\n• 活动运营、募资与 NPO 数字工具\n• 与地方政府合作及永续倡议\n\n无论你在带领在地计划、投身志愿，抑或只是对东京的社会影响好奇—在这里都能找到灵感、链接与让想法落地的机会。';

  const communityTcoc = await prisma.community.create({
    data: {
      name: 'Tokyo Community Organizations Meetup Group',
      slug: 'tcoc',
      ownerId: ownerC.id,
      pricingPlanId: starterPlan.id,
      visibleLevel: 'public',
      labels: ['collaboration', 'npo', 'community'],
      description: multiText(tcocAboutJa, tcocAboutZh, tcocAboutEn),
      language: 'en',
    },
  });

  await prisma.communityMember.createMany({
    data: [
      { communityId: communityKids.id, userId: ownerA.id, role: 'owner', status: 'active' },
      { communityId: communityLanguage.id, userId: ownerB.id, role: 'owner', status: 'active' },
      { communityId: communityTcoc.id, userId: ownerC.id, role: 'owner', status: 'active' },
    ],
  });

  const [sakura, liang, emily, haruka] = guests;

  const kidsFuture = await createEventWithTickets(communityKids.id, {
    title: multiText('井の頭親子自然さんぽ', '井之头亲子自然散步', 'Inokashira Family Nature Walk'),
    description: multiText(
      '多文化の遊びや自然観察を楽しむ親子向けイベント。',
      '与不同文化家庭一起观察春天的自然。',
      'A light hike with multilingual kids activities.',
    ),
    startTime: minutesFromNow(60 * 24 * 3),
    endTime: minutesFromNow(60 * 24 * 3 + 90),
    status: 'open',
    locationText: '井の頭恩賜公園',
    tickets: [
      { name: multiText('親子ペア無料チケット', '亲子免费票', 'Family Free Pass'), type: 'free', price: 0 },
      { name: multiText('サポーター寄付チケット', '支持者赞助票', 'Supporter Ticket'), type: 'normal', price: 1500 },
    ],
  });

  const kidsPast = await createEventWithTickets(communityKids.id, {
    title: multiText('多文化おやつ交流会', '多文化亲子点心会', 'Multicultural Snack Exchange'),
    description: multiText(
      '世界の手作りおやつを持ち寄り味わいます。',
      '带来自制点心和国际家庭分享。',
      'Bring homemade snacks and share stories with other families.',
    ),
    startTime: minutesFromNow(-60 * 24 * 5),
    endTime: minutesFromNow(-60 * 24 * 5 + 120),
    status: 'closed',
    locationText: '三鷹市民センター',
    tickets: [
      { name: multiText('親子フリーパス', '亲子票', 'Family Ticket'), type: 'normal', price: 800 },
    ],
  });

  const langOpen = await createEventWithTickets(communityLanguage.id, {
    title: multiText('夕暮れカフェ言語交流', '黄昏咖啡语言交换', 'Sunset Café Language Exchange'),
    description: multiText(
      'カフェで英語と日本語を楽しむ少人数交流。',
      '在咖啡店进行小规模的中英日交流。',
      'Small-group conversation circle with coffee.',
    ),
    startTime: minutesFromNow(60 * 24 * 7),
    endTime: minutesFromNow(60 * 24 * 7 + 120),
    status: 'open',
    locationText: '渋谷駅近くのカフェ',
    tickets: [
      { name: multiText('参加チケット', '普通票', 'General Ticket'), type: 'normal', price: 1200 },
    ],
  });

  const langPast = await createEventWithTickets(communityLanguage.id, {
    title: multiText('代々木公園ピクニック交流', '代代木公园野餐', 'Yoyogi Park Picnic Mixer'),
    description: multiText(
      '季節の食べ物を持ち寄る国際ピクニック。',
      '大家带上喜欢的食物在公园野餐。',
      'Share seasonal food and practice languages outdoors.',
    ),
    startTime: minutesFromNow(-60 * 24 * 10),
    endTime: minutesFromNow(-60 * 24 * 10 + 150),
    status: 'closed',
    locationText: '代々木公園',
    tickets: [
      { name: multiText('ピクニックフリー参加', '野餐免费票', 'Picnic Free Ticket'), type: 'free', price: 0 },
      { name: multiText('サポート寄付', '支持者票', 'Supporter Donation'), type: 'normal', price: 1000 },
    ],
  });

  // Registrations & attendance
  await createRegistration({
    eventId: kidsFuture.event.id,
    userId: sakura.id,
    ticketTypeId: kidsFuture.tickets[0].id,
    paid: true,
    attended: false,
  });
  await createRegistration({
    eventId: kidsFuture.event.id,
    userId: liang.id,
    ticketTypeId: kidsFuture.tickets[1].id,
    paid: true,
    attended: false,
  });

  await createRegistration({
    eventId: kidsPast.event.id,
    userId: sakura.id,
    ticketTypeId: kidsPast.tickets[0].id,
    paid: true,
    attended: true,
  });
  await createRegistration({
    eventId: kidsPast.event.id,
    userId: emily.id,
    ticketTypeId: kidsPast.tickets[0].id,
    paid: true,
    noShow: true,
  });

  await createRegistration({
    eventId: langOpen.event.id,
    userId: emily.id,
    ticketTypeId: langOpen.tickets[0].id,
    paid: true,
  });
  await createRegistration({
    eventId: langOpen.event.id,
    userId: haruka.id,
    ticketTypeId: langOpen.tickets[0].id,
    paid: true,
  });

  await createRegistration({
    eventId: langPast.event.id,
    userId: liang.id,
    ticketTypeId: langPast.tickets[0].id,
    paid: true,
    attended: true,
  });
  await createRegistration({
    eventId: langPast.event.id,
    userId: haruka.id,
    ticketTypeId: langPast.tickets[1].id,
    paid: true,
    noShow: true,
  });

  console.log('Seed data created!');
}

main()
  .catch((error) => {
    console.error('Seed error', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
