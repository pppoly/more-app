export type CommunityTagInput = {
  nameJa: string;
  nameZh?: string | null;
  nameEn?: string | null;
};

export type CommunityTagCategoryInput = {
  nameJa: string;
  nameZh?: string | null;
  nameEn?: string | null;
  order: number;
  tags: CommunityTagInput[];
};

export const COMMUNITY_TAG_TAXONOMY: CommunityTagCategoryInput[] = [
  {
    nameJa: 'スポーツ・外遊び',
    nameZh: '运动·户外',
    nameEn: 'Sports & Outdoor',
    order: 1,
    tags: [
      { nameJa: 'ラン', nameZh: '跑步', nameEn: 'Run' },
      { nameJa: 'フィットネス', nameZh: '健身', nameEn: 'Fitness' },
      { nameJa: 'ハイク', nameZh: '徒步', nameEn: 'Hike' },
      { nameJa: 'ヨガ', nameZh: '瑜伽', nameEn: 'Yoga' },
      { nameJa: 'バスケ/サッカー', nameZh: '篮球/足球', nameEn: 'Basketball/Football' },
      { nameJa: 'サイクリング', nameZh: '骑行', nameEn: 'Cycling' },
      { nameJa: 'ピクニック', nameZh: '野餐/BBQ', nameEn: 'Picnic/BBQ' },
      { nameJa: 'アウトドア', nameZh: '户外技能', nameEn: 'Outdoor Skills' },
    ],
  },
  {
    nameJa: '大学・キャンパス',
    nameZh: '校园社团',
    nameEn: 'Campus',
    order: 2,
    tags: [
      { nameJa: 'バンド', nameZh: '乐队', nameEn: 'Band' },
      { nameJa: 'ダンス', nameZh: '舞蹈', nameEn: 'Dance' },
      { nameJa: '演劇', nameZh: '话剧', nameEn: 'Theater' },
      { nameJa: 'アニメ/マンガ', nameZh: '动漫', nameEn: 'Anime/Manga' },
      { nameJa: '写真', nameZh: '摄影', nameEn: 'Photo' },
      { nameJa: '茶道/華道', nameZh: '茶道/花道', nameEn: 'Tea/Flower' },
      { nameJa: '武道', nameZh: '武道', nameEn: 'Martial Arts' },
      { nameJa: '英語/語学', nameZh: '英语/语言', nameEn: 'English/Language' },
      { nameJa: 'プログラミング', nameZh: '编程/创客', nameEn: 'Coding/Maker' },
      { nameJa: '学園祭', nameZh: '学园祭', nameEn: 'Campus Festival' },
      { nameJa: '研究会', nameZh: '研究会', nameEn: 'Study Circles' },
    ],
  },
  {
    nameJa: '交流・趣味',
    nameZh: '交流·兴趣',
    nameEn: 'Social & Hobbies',
    order: 3,
    tags: [
      { nameJa: '友だち作り', nameZh: '交朋友', nameEn: 'Meet Friends' },
      { nameJa: '多文化', nameZh: '多文化', nameEn: 'Multicultural' },
      { nameJa: '言語交換', nameZh: '语言交换', nameEn: 'Language Exchange' },
      { nameJa: '仕事交流', nameZh: '商务交流', nameEn: 'Business Meetup' },
      { nameJa: '趣味', nameZh: '兴趣', nameEn: 'Hobbies' },
      { nameJa: '親子交流', nameZh: '亲子交流', nameEn: 'Family Meetup' },
    ],
  },
  {
    nameJa: '仕事・キャリア',
    nameZh: '职业·创业',
    nameEn: 'Business & Career',
    order: 4,
    tags: [
      { nameJa: 'スタートアップ', nameZh: '创业', nameEn: 'Startup' },
      { nameJa: '投資/VC', nameZh: '投资/VC', nameEn: 'Investment/VC' },
      { nameJa: 'フリー', nameZh: '自由职业', nameEn: 'Freelance' },
      { nameJa: 'つながり', nameZh: '人脉', nameEn: 'Networking' },
      { nameJa: 'キャリア相談', nameZh: '职业咨询', nameEn: 'Career Coaching' },
      { nameJa: 'ものづくり交流', nameZh: '产品·设计·工程', nameEn: 'Product/Design/Eng' },
      { nameJa: '小商い', nameZh: '小生意', nameEn: 'Small Business' },
    ],
  },
  {
    nameJa: 'テック',
    nameZh: '科技',
    nameEn: 'Tech',
    order: 5,
    tags: [
      { nameJa: 'AI', nameZh: 'AI', nameEn: 'AI' },
      { nameJa: 'Web3', nameZh: 'Web3', nameEn: 'Web3' },
      { nameJa: 'Web開発', nameZh: '前后端', nameEn: 'Web Dev' },
      { nameJa: 'データ/ML', nameZh: '数据/ML', nameEn: 'Data/ML' },
      { nameJa: 'ロボ/IoT', nameZh: '机器人/IoT', nameEn: 'Robotics/IoT' },
      { nameJa: 'セキュリティ', nameZh: '安全', nameEn: 'Security' },
      { nameJa: 'メイカー', nameZh: '创客', nameEn: 'Maker' },
      { nameJa: 'Startup Tech', nameZh: '创业技术', nameEn: 'Startup Tech' },
      { nameJa: 'UI/UX', nameZh: 'UI/UX', nameEn: 'UI/UX' },
    ],
  },
  {
    nameJa: 'アート・カルチャー',
    nameZh: '艺术·文化',
    nameEn: 'Art & Culture',
    order: 6,
    tags: [
      { nameJa: '絵/イラスト', nameZh: '绘画/插画', nameEn: 'Art/Illustration' },
      { nameJa: '写真', nameZh: '摄影', nameEn: 'Photography' },
      { nameJa: '手作り', nameZh: '手作', nameEn: 'Handmade' },
      { nameJa: 'アニメ文化', nameZh: '动漫文化', nameEn: 'Anime Culture' },
      { nameJa: '街歩き', nameZh: '城市漫步', nameEn: 'City Walk' },
      { nameJa: '建築/インテリア', nameZh: '建筑/室内', nameEn: 'Architecture/Interior' },
      { nameJa: '音楽カルチャー', nameZh: '音乐文化', nameEn: 'Music Culture' },
    ],
  },
  {
    nameJa: '音楽・ライブ',
    nameZh: '音乐·演出',
    nameEn: 'Music & Live',
    order: 7,
    tags: [
      { nameJa: 'ライブ', nameZh: '现场演出', nameEn: 'Live' },
      { nameJa: 'DJ/クラブ', nameZh: 'DJ/俱乐部', nameEn: 'DJ/Club' },
      { nameJa: 'オープンマイク', nameZh: '开放麦', nameEn: 'Open Mic' },
      { nameJa: 'ステージ', nameZh: '舞台', nameEn: 'Stage' },
      { nameJa: 'K/J-pop', nameZh: 'K/J-pop', nameEn: 'K/J-pop' },
      { nameJa: 'ダンス', nameZh: '舞蹈演出', nameEn: 'Dance' },
      { nameJa: 'セッション', nameZh: '乐队Jam', nameEn: 'Band Jam' },
      { nameJa: 'ショーケース', nameZh: '展演', nameEn: 'Showcase' },
    ],
  },
  {
    nameJa: 'たべもの・のみもの',
    nameZh: '吃吃喝喝',
    nameEn: 'Food & Drink',
    order: 8,
    tags: [
      { nameJa: 'ワイン', nameZh: '葡萄酒', nameEn: 'Wine' },
      { nameJa: '日本酒', nameZh: '日本酒', nameEn: 'Sake' },
      { nameJa: 'ベーキング', nameZh: '烘焙', nameEn: 'Baking' },
      { nameJa: '料理', nameZh: '家常菜', nameEn: 'Home Cooking' },
      { nameJa: '中華', nameZh: '中餐', nameEn: 'Chinese Food' },
      { nameJa: 'コーヒー/茶', nameZh: '咖啡/茶', nameEn: 'Coffee/Tea' },
      { nameJa: '食べ歩き', nameZh: '美食探索', nameEn: 'Food Crawl' },
      { nameJa: '居酒屋', nameZh: '居酒屋', nameEn: 'Izakaya' },
    ],
  },
  {
    nameJa: '親子・子育て',
    nameZh: '亲子·育儿',
    nameEn: 'Family & Kids',
    order: 9,
    tags: [
      { nameJa: '親子WS', nameZh: '亲子工作坊', nameEn: 'Parent-Kid WS' },
      { nameJa: 'キッズ学習', nameZh: '儿童学习', nameEn: 'Kids Learning' },
      { nameJa: 'インター交流', nameZh: '国际校交流', nameEn: 'Intl School' },
      { nameJa: 'ファミリーデー', nameZh: '家庭日', nameEn: 'Family Day' },
      { nameJa: 'サイエンス', nameZh: '科学实验', nameEn: 'Science Lab' },
      { nameJa: '絵本', nameZh: '绘本', nameEn: 'Storytime' },
    ],
  },
  {
    nameJa: '語学・学び',
    nameZh: '语言·学习',
    nameEn: 'Language & Learning',
    order: 10,
    tags: [
      { nameJa: '日本語/JLPT', nameZh: '日语/JLPT', nameEn: 'Japanese/JLPT' },
      { nameJa: '英会話', nameZh: '英语会话', nameEn: 'English Chat' },
      { nameJa: 'ビジネス日本語', nameZh: '商务日语', nameEn: 'Biz Japanese' },
      { nameJa: '多言語カフェ', nameZh: '多语咖啡', nameEn: 'Language Cafe' },
      { nameJa: '書く・話す', nameZh: '写作/演讲', nameEn: 'Writing/Speaking' },
      { nameJa: '専門研修', nameZh: '专业培训', nameEn: 'Skills Training' },
    ],
  },
  {
    nameJa: 'ボランティア・地域',
    nameZh: '公益·社区',
    nameEn: 'Community & Public',
    order: 11,
    tags: [
      { nameJa: 'ボランティア', nameZh: '志愿', nameEn: 'Volunteer' },
      { nameJa: '外国人サポート', nameZh: '外国人支援', nameEn: 'Migrant Support' },
      { nameJa: 'エコ/環境', nameZh: '环保', nameEn: 'Environment' },
      { nameJa: 'チャリティ', nameZh: '义卖/慈善', nameEn: 'Charity' },
      { nameJa: '助け合い', nameZh: '互助', nameEn: 'Mutual Aid' },
      { nameJa: '防災', nameZh: '防灾', nameEn: 'Disaster Prep' },
      { nameJa: 'シェルター', nameZh: '庇护所', nameEn: 'Shelter' },
    ],
  },
  {
    nameJa: '心と成長',
    nameZh: '心理·成长',
    nameEn: 'Mind & Growth',
    order: 12,
    tags: [
      { nameJa: '瞑想', nameZh: '冥想', nameEn: 'Meditation' },
      { nameJa: '仏教', nameZh: '佛教', nameEn: 'Buddhism' },
      { nameJa: 'メンタル', nameZh: '心理健康', nameEn: 'Mental Health' },
      { nameJa: '感情ケア', nameZh: '情绪管理', nameEn: 'Emotion Care' },
      { nameJa: 'ヒーリング', nameZh: '疗愈/静修', nameEn: 'Healing' },
    ],
  },
  {
    nameJa: 'オンライン・WS',
    nameZh: '线上·工作坊',
    nameEn: 'Online & Workshops',
    order: 13,
    tags: [
      { nameJa: 'ウェビナー', nameZh: '线上讲座', nameEn: 'Webinar' },
      { nameJa: 'オンライン講座', nameZh: '在线课程', nameEn: 'Online Course' },
      { nameJa: 'ワークショップ', nameZh: '工作坊', nameEn: 'Workshop' },
      { nameJa: '読書会', nameZh: '读书会', nameEn: 'Book Club' },
      { nameJa: 'アイデアソン', nameZh: '创意赛', nameEn: 'Ideathon' },
      { nameJa: '相談/コーチング', nameZh: '咨询/辅导', nameEn: 'Coaching' },
    ],
  },
];

