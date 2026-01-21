-- Seed "CommunityTagCategory" (社群大类) + "CommunityTag" (社群 tag)
-- Source of truth: backend/src/communities/community-tags.taxonomy.ts
--
-- Idempotency:
-- - Category match key: ("nameJa") -> updates the earliest created row if duplicates exist
-- - Tag match key: ("categoryId", "nameJa") -> updates the earliest created row if duplicates exist
--
-- Requires: pgcrypto (for gen_random_uuid)

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Upsert categories by nameJa
WITH src("nameJa", "nameZh", "nameEn", "order") AS (
  VALUES
    ('スポーツ・外遊び', '运动·户外', 'Sports & Outdoor', 1),
    ('大学・キャンパス', '校园社团', 'Campus', 2),
    ('交流・趣味', '交流·兴趣', 'Social & Hobbies', 3),
    ('仕事・キャリア', '职业·创业', 'Business & Career', 4),
    ('テック', '科技', 'Tech', 5),
    ('アート・カルチャー', '艺术·文化', 'Art & Culture', 6),
    ('音楽・ライブ', '音乐·演出', 'Music & Live', 7),
    ('たべもの・のみもの', '吃吃喝喝', 'Food & Drink', 8),
    ('親子・子育て', '亲子·育儿', 'Family & Kids', 9),
    ('語学・学び', '语言·学习', 'Language & Learning', 10),
    ('ボランティア・地域', '公益·社区', 'Community & Public', 11),
    ('心と成長', '心理·成长', 'Mind & Growth', 12),
    ('オンライン・WS', '线上·工作坊', 'Online & Workshops', 13)
),
matched AS (
  SELECT
    s.*,
    existing."id" AS existing_id
  FROM src s
  LEFT JOIN LATERAL (
    SELECT "id"
    FROM "CommunityTagCategory"
    WHERE "nameJa" = s."nameJa"
    ORDER BY "createdAt" ASC
    LIMIT 1
  ) existing ON TRUE
),
upsert_input AS (
  SELECT
    COALESCE(existing_id, gen_random_uuid()::text) AS "id",
    "nameJa",
    NULLIF("nameZh", '') AS "nameZh",
    NULLIF("nameEn", '') AS "nameEn",
    "order"
  FROM matched
)
INSERT INTO "CommunityTagCategory" (
  "id",
  "nameJa",
  "nameZh",
  "nameEn",
  "order",
  "active",
  "createdAt",
  "updatedAt"
)
SELECT
  u."id",
  u."nameJa",
  u."nameZh",
  u."nameEn",
  u."order",
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM upsert_input u
ON CONFLICT ("id") DO UPDATE SET
  "nameJa" = EXCLUDED."nameJa",
  "nameZh" = EXCLUDED."nameZh",
  "nameEn" = EXCLUDED."nameEn",
  "order" = EXCLUDED."order",
  "active" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP;

-- 2) Upsert tags by (category nameJa -> categoryId) + tag nameJa
WITH cat AS (
  SELECT "id", "nameJa"
  FROM "CommunityTagCategory"
  WHERE "nameJa" IN (
    'スポーツ・外遊び',
    '大学・キャンパス',
    '交流・趣味',
    '仕事・キャリア',
    'テック',
    'アート・カルチャー',
    '音楽・ライブ',
    'たべもの・のみもの',
    '親子・子育て',
    '語学・学び',
    'ボランティア・地域',
    '心と成長',
    'オンライン・WS'
  )
),
src("categoryNameJa", "nameJa", "nameZh", "nameEn", "order") AS (
  VALUES
    -- スポーツ・外遊び
    ('スポーツ・外遊び', 'ラン', '跑步', 'Run', 1),
    ('スポーツ・外遊び', 'フィットネス', '健身', 'Fitness', 2),
    ('スポーツ・外遊び', 'ハイク', '徒步', 'Hike', 3),
    ('スポーツ・外遊び', 'ヨガ', '瑜伽', 'Yoga', 4),
    ('スポーツ・外遊び', 'バスケ/サッカー', '篮球/足球', 'Basketball/Football', 5),
    ('スポーツ・外遊び', 'サイクリング', '骑行', 'Cycling', 6),
    ('スポーツ・外遊び', 'ピクニック', '野餐/BBQ', 'Picnic/BBQ', 7),
    ('スポーツ・外遊び', 'アウトドア', '户外技能', 'Outdoor Skills', 8),

    -- 大学・キャンパス
    ('大学・キャンパス', 'バンド', '乐队', 'Band', 1),
    ('大学・キャンパス', 'ダンス', '舞蹈', 'Dance', 2),
    ('大学・キャンパス', '演劇', '话剧', 'Theater', 3),
    ('大学・キャンパス', 'アニメ/マンガ', '动漫', 'Anime/Manga', 4),
    ('大学・キャンパス', '写真', '摄影', 'Photo', 5),
    ('大学・キャンパス', '茶道/華道', '茶道/花道', 'Tea/Flower', 6),
    ('大学・キャンパス', '武道', '武道', 'Martial Arts', 7),
    ('大学・キャンパス', '英語/語学', '英语/语言', 'English/Language', 8),
    ('大学・キャンパス', 'プログラミング', '编程/创客', 'Coding/Maker', 9),
    ('大学・キャンパス', '学園祭', '学园祭', 'Campus Festival', 10),
    ('大学・キャンパス', '研究会', '研究会', 'Study Circles', 11),

    -- 交流・趣味
    ('交流・趣味', '友だち作り', '交朋友', 'Meet Friends', 1),
    ('交流・趣味', '多文化', '多文化', 'Multicultural', 2),
    ('交流・趣味', '言語交換', '语言交换', 'Language Exchange', 3),
    ('交流・趣味', '仕事交流', '商务交流', 'Business Meetup', 4),
    ('交流・趣味', '趣味', '兴趣', 'Hobbies', 5),
    ('交流・趣味', '親子交流', '亲子交流', 'Family Meetup', 6),

    -- 仕事・キャリア
    ('仕事・キャリア', 'スタートアップ', '创业', 'Startup', 1),
    ('仕事・キャリア', '投資/VC', '投资/VC', 'Investment/VC', 2),
    ('仕事・キャリア', 'フリー', '自由职业', 'Freelance', 3),
    ('仕事・キャリア', 'つながり', '人脉', 'Networking', 4),
    ('仕事・キャリア', 'キャリア相談', '职业咨询', 'Career Coaching', 5),
    ('仕事・キャリア', 'ものづくり交流', '产品·设计·工程', 'Product/Design/Eng', 6),
    ('仕事・キャリア', '小商い', '小生意', 'Small Business', 7),

    -- テック
    ('テック', 'AI', 'AI', 'AI', 1),
    ('テック', 'Web3', 'Web3', 'Web3', 2),
    ('テック', 'Web開発', '前后端', 'Web Dev', 3),
    ('テック', 'データ/ML', '数据/ML', 'Data/ML', 4),
    ('テック', 'ロボ/IoT', '机器人/IoT', 'Robotics/IoT', 5),
    ('テック', 'セキュリティ', '安全', 'Security', 6),
    ('テック', 'メイカー', '创客', 'Maker', 7),
    ('テック', 'Startup Tech', '创业技术', 'Startup Tech', 8),
    ('テック', 'UI/UX', 'UI/UX', 'UI/UX', 9),

    -- アート・カルチャー
    ('アート・カルチャー', '絵/イラスト', '绘画/插画', 'Art/Illustration', 1),
    ('アート・カルチャー', '写真', '摄影', 'Photography', 2),
    ('アート・カルチャー', '手作り', '手作', 'Handmade', 3),
    ('アート・カルチャー', 'アニメ文化', '动漫文化', 'Anime Culture', 4),
    ('アート・カルチャー', '街歩き', '城市漫步', 'City Walk', 5),
    ('アート・カルチャー', '建築/インテリア', '建筑/室内', 'Architecture/Interior', 6),
    ('アート・カルチャー', '音楽カルチャー', '音乐文化', 'Music Culture', 7),

    -- 音楽・ライブ
    ('音楽・ライブ', 'ライブ', '现场演出', 'Live', 1),
    ('音楽・ライブ', 'DJ/クラブ', 'DJ/俱乐部', 'DJ/Club', 2),
    ('音楽・ライブ', 'オープンマイク', '开放麦', 'Open Mic', 3),
    ('音楽・ライブ', 'ステージ', '舞台', 'Stage', 4),
    ('音楽・ライブ', 'K/J-pop', 'K/J-pop', 'K/J-pop', 5),
    ('音楽・ライブ', 'ダンス', '舞蹈演出', 'Dance', 6),
    ('音楽・ライブ', 'セッション', '乐队Jam', 'Band Jam', 7),
    ('音楽・ライブ', 'ショーケース', '展演', 'Showcase', 8),

    -- たべもの・のみもの
    ('たべもの・のみもの', 'ワイン', '葡萄酒', 'Wine', 1),
    ('たべもの・のみもの', '日本酒', '日本酒', 'Sake', 2),
    ('たべもの・のみもの', 'ベーキング', '烘焙', 'Baking', 3),
    ('たべもの・のみもの', '料理', '家常菜', 'Home Cooking', 4),
    ('たべもの・のみもの', '中華', '中餐', 'Chinese Food', 5),
    ('たべもの・のみもの', 'コーヒー/茶', '咖啡/茶', 'Coffee/Tea', 6),
    ('たべもの・のみもの', '食べ歩き', '美食探索', 'Food Crawl', 7),
    ('たべもの・のみもの', '居酒屋', '居酒屋', 'Izakaya', 8),

    -- 親子・子育て
    ('親子・子育て', '親子WS', '亲子工作坊', 'Parent-Kid WS', 1),
    ('親子・子育て', 'キッズ学習', '儿童学习', 'Kids Learning', 2),
    ('親子・子育て', 'インター交流', '国际校交流', 'Intl School', 3),
    ('親子・子育て', 'ファミリーデー', '家庭日', 'Family Day', 4),
    ('親子・子育て', 'サイエンス', '科学实验', 'Science Lab', 5),
    ('親子・子育て', '絵本', '绘本', 'Storytime', 6),

    -- 語学・学び
    ('語学・学び', '日本語/JLPT', '日语/JLPT', 'Japanese/JLPT', 1),
    ('語学・学び', '英会話', '英语会话', 'English Chat', 2),
    ('語学・学び', 'ビジネス日本語', '商务日语', 'Biz Japanese', 3),
    ('語学・学び', '多言語カフェ', '多语咖啡', 'Language Cafe', 4),
    ('語学・学び', '書く・話す', '写作/演讲', 'Writing/Speaking', 5),
    ('語学・学び', '専門研修', '专业培训', 'Skills Training', 6),

    -- ボランティア・地域
    ('ボランティア・地域', 'ボランティア', '志愿', 'Volunteer', 1),
    ('ボランティア・地域', '外国人サポート', '外国人支援', 'Migrant Support', 2),
    ('ボランティア・地域', 'エコ/環境', '环保', 'Environment', 3),
    ('ボランティア・地域', 'チャリティ', '义卖/慈善', 'Charity', 4),
    ('ボランティア・地域', '助け合い', '互助', 'Mutual Aid', 5),
    ('ボランティア・地域', '防災', '防灾', 'Disaster Prep', 6),
    ('ボランティア・地域', 'シェルター', '庇护所', 'Shelter', 7),

    -- 心と成長
    ('心と成長', '瞑想', '冥想', 'Meditation', 1),
    ('心と成長', '仏教', '佛教', 'Buddhism', 2),
    ('心と成長', 'メンタル', '心理健康', 'Mental Health', 3),
    ('心と成長', '感情ケア', '情绪管理', 'Emotion Care', 4),
    ('心と成長', 'ヒーリング', '疗愈/静修', 'Healing', 5),

    -- オンライン・WS
    ('オンライン・WS', 'ウェビナー', '线上讲座', 'Webinar', 1),
    ('オンライン・WS', 'オンライン講座', '在线课程', 'Online Course', 2),
    ('オンライン・WS', 'ワークショップ', '工作坊', 'Workshop', 3),
    ('オンライン・WS', '読書会', '读书会', 'Book Club', 4),
    ('オンライン・WS', 'アイデアソン', '创意赛', 'Ideathon', 5),
    ('オンライン・WS', '相談/コーチング', '咨询/辅导', 'Coaching', 6)
),
matched AS (
  SELECT
    c."id" AS category_id,
    s."nameJa",
    NULLIF(s."nameZh", '') AS "nameZh",
    NULLIF(s."nameEn", '') AS "nameEn",
    s."order",
    existing."id" AS existing_id
  FROM src s
  JOIN cat c ON c."nameJa" = s."categoryNameJa"
  LEFT JOIN LATERAL (
    SELECT "id"
    FROM "CommunityTag"
    WHERE "categoryId" = c."id" AND "nameJa" = s."nameJa"
    ORDER BY "createdAt" ASC
    LIMIT 1
  ) existing ON TRUE
),
upsert_input AS (
  SELECT
    COALESCE(existing_id, gen_random_uuid()::text) AS "id",
    category_id AS "categoryId",
    "nameJa",
    "nameZh",
    "nameEn",
    "order"
  FROM matched
)
INSERT INTO "CommunityTag" (
  "id",
  "categoryId",
  "nameJa",
  "nameZh",
  "nameEn",
  "order",
  "active",
  "createdAt",
  "updatedAt"
)
SELECT
  u."id",
  u."categoryId",
  u."nameJa",
  u."nameZh",
  u."nameEn",
  u."order",
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM upsert_input u
ON CONFLICT ("id") DO UPDATE SET
  "categoryId" = EXCLUDED."categoryId",
  "nameJa" = EXCLUDED."nameJa",
  "nameZh" = EXCLUDED."nameZh",
  "nameEn" = EXCLUDED."nameEn",
  "order" = EXCLUDED."order",
  "active" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP;

COMMIT;

-- Optional quick checks:
-- SELECT COUNT(*) FROM "CommunityTagCategory";
-- SELECT COUNT(*) FROM "CommunityTag";

