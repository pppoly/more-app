import { PrismaClient } from '@prisma/client';

type TagInput = {
  nameJa: string;
  nameZh?: string | null;
  nameEn?: string | null;
};

type CategoryInput = {
  nameJa: string;
  nameZh?: string | null;
  nameEn?: string | null;
  order: number;
  tags: TagInput[];
};

const prisma = new PrismaClient();

const taxonomy: CategoryInput[] = [
  {
    nameJa: 'スポーツ・健康・アウトドア',
    nameZh: '运动 / 健康 / 户外',
    nameEn: 'Sports / Health / Outdoor',
    order: 1,
    tags: [
      { nameJa: 'ランニング', nameZh: '跑步', nameEn: 'Running' },
      { nameJa: 'フィットネス', nameZh: '健身', nameEn: 'Fitness' },
      { nameJa: 'ハイキング/登山', nameZh: '徒步/登山', nameEn: 'Hiking / Trekking' },
      { nameJa: 'ヨガ/ピラティス', nameZh: '瑜伽/普拉提', nameEn: 'Yoga / Pilates' },
      { nameJa: 'バスケ/サッカー', nameZh: '篮球/足球', nameEn: 'Basketball / Football' },
      { nameJa: 'サイクリング', nameZh: '骑行', nameEn: 'Cycling' },
      { nameJa: 'ピクニック/BBQ', nameZh: '野餐/BBQ', nameEn: 'Picnic / BBQ' },
      { nameJa: 'アウトドアスキル', nameZh: '户外生存', nameEn: 'Outdoor Skills' },
    ],
  },
  {
    nameJa: '大学サークル / キャンパス',
    nameZh: '大学社团 / 校园圈（日式特色）',
    nameEn: 'University Clubs / Campus',
    order: 2,
    tags: [
      { nameJa: '軽音/バンド', nameZh: '轻音/乐队社', nameEn: 'Band / Light Music' },
      { nameJa: 'ダンスサークル', nameZh: '舞团/舞蹈社', nameEn: 'Dance Club' },
      { nameJa: '演劇部', nameZh: '演剧部', nameEn: 'Theater' },
      { nameJa: '漫研/アニメ', nameZh: '漫研/动漫社', nameEn: 'Anime / Manga' },
      { nameJa: '写真部', nameZh: '摄影部', nameEn: 'Photography' },
      { nameJa: '茶道/華道', nameZh: '茶道/花道社', nameEn: 'Tea / Flower Arrangement' },
      { nameJa: '合気道/柔道/剣道', nameZh: '合气道/柔道/剑道部', nameEn: 'Aikido / Judo / Kendo' },
      { nameJa: '英語・語学', nameZh: '英语/语言部', nameEn: 'English / Language' },
      { nameJa: 'プログラミング/メイカー', nameZh: '编程/创客社', nameEn: 'Programming / Maker' },
      { nameJa: '学園祭実行', nameZh: '学园祭筹备', nameEn: 'Campus Festival' },
      { nameJa: '研究会（経済/文学/歴史）', nameZh: '研究会（経済/文学/历史等）', nameEn: 'Study Circles' },
    ],
  },
  {
    nameJa: '交流・趣味',
    nameZh: '社交 / 交流 / 兴趣',
    nameEn: 'Social / Hobby',
    order: 3,
    tags: [
      { nameJa: '友達づくり', nameZh: '交友/认识新朋友', nameEn: 'Meet New Friends' },
      { nameJa: '多文化交流', nameZh: '多文化交流', nameEn: 'Multicultural Exchange' },
      { nameJa: 'Language Exchange', nameZh: 'Language Exchange', nameEn: 'Language Exchange' },
      { nameJa: 'ビジネス交流', nameZh: '商务社交', nameEn: 'Business Networking' },
      { nameJa: '趣味サークル', nameZh: '兴趣圈聚会', nameEn: 'Hobby Circles' },
      { nameJa: 'ファミリー/親子交流', nameZh: '家庭亲子交流', nameEn: 'Family / Parents & Kids' },
    ],
  },
  {
    nameJa: 'ビジネス・起業・キャリア',
    nameZh: '商业 / 创业 / 职业成长',
    nameEn: 'Business / Startup / Career',
    order: 4,
    tags: [
      { nameJa: 'スタートアップ', nameZh: '创业/Startup', nameEn: 'Startup' },
      { nameJa: '投資/VC', nameZh: '投资/创投', nameEn: 'Investment / VC' },
      { nameJa: 'フリーランス', nameZh: '自由职业者', nameEn: 'Freelancer' },
      { nameJa: 'ネットワーキング', nameZh: '人脉拓展', nameEn: 'Networking' },
      { nameJa: 'キャリアコーチング', nameZh: '职业辅导', nameEn: 'Career Coaching' },
      { nameJa: 'プロダクト/デザイン/エンジニア交流', nameZh: '产品/设计/工程师交流', nameEn: 'Product/Design/Engineering' },
      { nameJa: 'スモールビジネス経営', nameZh: '小商户经营', nameEn: 'Small Business' },
    ],
  },
  {
    nameJa: 'テック / IT / AI',
    nameZh: '科技 / IT / AI',
    nameEn: 'Tech / IT / AI',
    order: 5,
    tags: [
      { nameJa: 'AI/生成AI/LLM', nameZh: 'AI/生成式AI/LLM', nameEn: 'AI / GenAI / LLM' },
      { nameJa: 'Web3/Crypto', nameZh: 'Web3/Crypto', nameEn: 'Web3 / Crypto' },
      { nameJa: 'フロントエンド/バックエンド開発', nameZh: '前端/后端开发', nameEn: 'Frontend / Backend Dev' },
      { nameJa: 'データサイエンス/ML', nameZh: '数据科学/ML', nameEn: 'Data Science / ML' },
      { nameJa: 'ロボティクス/IoT', nameZh: '机器人/IoT', nameEn: 'Robotics / IoT' },
      { nameJa: 'セキュリティ', nameZh: '安全', nameEn: 'Security' },
      { nameJa: 'メイカー', nameZh: '创客/Maker', nameEn: 'Maker' },
      { nameJa: 'スタートアップテック', nameZh: 'Startup Tech', nameEn: 'Startup Tech' },
      { nameJa: 'UI/UXデザイン', nameZh: 'UI/UX 设计', nameEn: 'UI/UX Design' },
    ],
  },
  {
    nameJa: 'アート / 文化 / デザイン',
    nameZh: '艺术 / 文化 / 设计',
    nameEn: 'Art / Culture / Design',
    order: 6,
    tags: [
      { nameJa: '絵画/イラスト', nameZh: '绘画/插画', nameEn: 'Painting / Illustration' },
      { nameJa: '写真', nameZh: '摄影', nameEn: 'Photography' },
      { nameJa: 'ハンドメイド', nameZh: '手作', nameEn: 'Handcraft' },
      { nameJa: 'アニメ/マンガ文化', nameZh: '动漫文化', nameEn: 'Anime / Manga' },
      { nameJa: 'シティカルチャー散歩', nameZh: '城市文化散步', nameEn: 'City Walks' },
      { nameJa: '建築/インテリア', nameZh: '建筑/室内', nameEn: 'Architecture / Interior' },
      { nameJa: '音楽カルチャー講座', nameZh: '音乐文化讲座', nameEn: 'Music Culture Talks' },
    ],
  },
  {
    nameJa: '音楽 / パフォーマンス / エンタメ',
    nameZh: '音乐 / 表演 / 娱乐',
    nameEn: 'Music / Performance / Entertainment',
    order: 7,
    tags: [
      { nameJa: 'ライブ', nameZh: 'Live 演出', nameEn: 'Live Performance' },
      { nameJa: 'DJ/クラブ', nameZh: 'DJ/Club', nameEn: 'DJ / Club' },
      { nameJa: 'オープンマイク', nameZh: 'Open Mic', nameEn: 'Open Mic' },
      { nameJa: '演劇/ステージ', nameZh: '舞台剧', nameEn: 'Stage / Theater' },
      { nameJa: 'K-pop/J-pop', nameZh: 'K-pop/J-pop', nameEn: 'K-pop / J-pop' },
      { nameJa: 'ダンスショー', nameZh: '舞蹈活动', nameEn: 'Dance' },
      { nameJa: 'バンドセッション', nameZh: '乐队 Jam', nameEn: 'Band Jam' },
      { nameJa: 'パフォーマンス展示', nameZh: '展演会', nameEn: 'Showcase' },
    ],
  },
  {
    nameJa: '美食 / 飲み物',
    nameZh: '美食 / 饮品',
    nameEn: 'Food / Drink',
    order: 8,
    tags: [
      { nameJa: 'ワインテイスティング', nameZh: '葡萄酒品鉴', nameEn: 'Wine Tasting' },
      { nameJa: '日本酒体験', nameZh: '日本清酒', nameEn: 'Sake Experience' },
      { nameJa: 'ベーキング', nameZh: '烘焙', nameEn: 'Baking' },
      { nameJa: '家庭料理', nameZh: '家庭料理', nameEn: 'Home Cooking' },
      { nameJa: '中華料理文化', nameZh: '中餐文化', nameEn: 'Chinese Cuisine' },
      { nameJa: 'コーヒー/ティー', nameZh: '咖啡/茶', nameEn: 'Coffee / Tea' },
      { nameJa: 'グルメ探索', nameZh: '美食探索', nameEn: 'Food Explorations' },
      { nameJa: '居酒屋交流', nameZh: '居酒屋交流', nameEn: 'Izakaya Meetup' },
    ],
  },
  {
    nameJa: '家庭 / 親子 / 教育',
    nameZh: '家庭 / 亲子 / 教育',
    nameEn: 'Family / Kids / Education',
    order: 9,
    tags: [
      { nameJa: '親子ワークショップ', nameZh: '亲子工作坊', nameEn: 'Parent & Kid Workshop' },
      { nameJa: 'キッズ学習', nameZh: '儿童学习', nameEn: 'Kids Learning' },
      { nameJa: 'インター校交流', nameZh: '国际学校交流', nameEn: 'International School Exchange' },
      { nameJa: 'ファミリーデー', nameZh: '家庭日', nameEn: 'Family Day' },
      { nameJa: 'サイエンス実験', nameZh: '科学实验课', nameEn: 'Science Experiments' },
      { nameJa: '絵本リーディング', nameZh: '绘本阅读', nameEn: 'Picture Book Reading' },
    ],
  },
  {
    nameJa: '語学 / 学習 / 研修',
    nameZh: '语言 / 学习 / 培训',
    nameEn: 'Language / Learning / Training',
    order: 10,
    tags: [
      { nameJa: '日本語/JLPT', nameZh: '日语学习/JLPT', nameEn: 'Japanese / JLPT' },
      { nameJa: '英会話', nameZh: '英语会话', nameEn: 'English Conversation' },
      { nameJa: 'ビジネス日本語', nameZh: '商务日语', nameEn: 'Business Japanese' },
      { nameJa: '多言語カフェ', nameZh: '多语言角', nameEn: 'Multi-language Cafe' },
      { nameJa: 'ライティング/スピーチ', nameZh: '写作/演讲', nameEn: 'Writing / Speech' },
      { nameJa: '専門スキル研修（IT/介護/建築）', nameZh: '专业技能培训（IT/护理/建筑）', nameEn: 'Vocational Skills' },
    ],
  },
  {
    nameJa: '公益 / コミュニティ支援',
    nameZh: '公益 / 社区支持',
    nameEn: 'Public Good / Community Support',
    order: 11,
    tags: [
      { nameJa: 'ボランティア', nameZh: '志愿者', nameEn: 'Volunteer' },
      { nameJa: '外国人サポート', nameZh: '外国人支援活动', nameEn: 'Migrant Support' },
      { nameJa: '都市環境/エコ', nameZh: '城市环保', nameEn: 'Environment' },
      { nameJa: 'チャリティ/バザー', nameZh: '捐赠义卖', nameEn: 'Charity / Bazaar' },
      { nameJa: 'コミュニティ助け合い', nameZh: '社区互助', nameEn: 'Mutual Aid' },
      { nameJa: '防災', nameZh: '灾害预防', nameEn: 'Disaster Preparedness' },
      { nameJa: 'シェルター支援', nameZh: '庇护所支持', nameEn: 'Shelter Support' },
    ],
  },
  {
    nameJa: '宗教 / マインド / 成長',
    nameZh: '宗教 / 心理 / 成长',
    nameEn: 'Religion / Mind / Growth',
    order: 12,
    tags: [
      { nameJa: 'メディテーション', nameZh: '冥想', nameEn: 'Meditation' },
      { nameJa: '仏教講座', nameZh: '佛教讲座', nameEn: 'Buddhism Talk' },
      { nameJa: 'メンタルヘルス', nameZh: '心理健康', nameEn: 'Mental Health' },
      { nameJa: '感情マネジメント', nameZh: '情绪管理', nameEn: 'Emotion Management' },
      { nameJa: 'ヒーリング/静寂会', nameZh: 'Healing/静默会', nameEn: 'Healing / Silent Retreat' },
    ],
  },
  {
    nameJa: 'オンライン / ワークショップ / その他',
    nameZh: '线上 / 工作坊 / 其他',
    nameEn: 'Online / Workshops / Other',
    order: 13,
    tags: [
      { nameJa: 'オンラインウェビナー', nameZh: '线上 Webinar', nameEn: 'Online Webinar' },
      { nameJa: 'オンライン講座', nameZh: '在线课程', nameEn: 'Online Course' },
      { nameJa: 'ワークショップ', nameZh: '工作坊', nameEn: 'Workshop' },
      { nameJa: '読書会', nameZh: '读书会', nameEn: 'Book Club' },
      { nameJa: 'アイデアソン', nameZh: '创意脑暴', nameEn: 'Ideathon' },
      { nameJa: 'コーチング/相談', nameZh: '咨询辅导', nameEn: 'Coaching / Counseling' },
    ],
  },
];

async function upsertCategory(category: CategoryInput) {
  const existing = await prisma.communityTagCategory.findFirst({ where: { nameJa: category.nameJa } });
  if (existing) {
    const updated = await prisma.communityTagCategory.update({
      where: { id: existing.id },
      data: {
        nameZh: category.nameZh ?? null,
        nameEn: category.nameEn ?? null,
        order: category.order,
        active: true,
      },
    });
    return updated.id;
  }

  const created = await prisma.communityTagCategory.create({
    data: {
      nameJa: category.nameJa,
      nameZh: category.nameZh ?? null,
      nameEn: category.nameEn ?? null,
      order: category.order,
      active: true,
    },
  });
  return created.id;
}

async function upsertTag(categoryId: string, tag: TagInput, order: number) {
  const existing = await prisma.communityTag.findFirst({
    where: { categoryId, nameJa: tag.nameJa },
  });
  if (existing) {
    await prisma.communityTag.update({
      where: { id: existing.id },
      data: {
        nameZh: tag.nameZh ?? null,
        nameEn: tag.nameEn ?? null,
        order,
        active: true,
      },
    });
    return existing.id;
  }
  const created = await prisma.communityTag.create({
    data: {
      categoryId,
      nameJa: tag.nameJa,
      nameZh: tag.nameZh ?? null,
      nameEn: tag.nameEn ?? null,
      order,
      active: true,
    },
  });
  return created.id;
}

async function main() {
  for (const category of taxonomy) {
    const categoryId = await upsertCategory(category);
    for (const [idx, tag] of category.tags.entries()) {
      await upsertTag(categoryId, tag, idx + 1);
    }
  }

  const totalCategories = await prisma.communityTagCategory.count();
  const totalTags = await prisma.communityTag.count();
  // eslint-disable-next-line no-console
  console.log(`Seeded community tag taxonomy. Categories: ${totalCategories}, Tags: ${totalTags}`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to seed community tags', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
