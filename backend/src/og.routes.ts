import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

const DEFAULT_OG_IMAGE =
  'https://app.socialmore.jp/uploads/og/default-event-cover.png';

router.get('/events/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const event = await prisma.event.findUnique({
      where: { id },
      select: {
        title: true,
        description: true,
        
      },
    });

    const title = event?.title ?? 'SOCIALMORE イベント';
    const description =
      event?.description ??
      'SOCIALMOREで開催されるイベントです。詳細をチェックして参加しませんか？';
    const image = DEFAULT_OG_IMAGE;
    const url = `https://app.socialmore.jp/events/${id}`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${image}" />
</head>
<body></body>
</html>`);
  } catch (e) {
    res.status(500).send('OG error');
  }
});

export default router;
