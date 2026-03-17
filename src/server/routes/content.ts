import { Hono } from 'hono';
import { db } from '../db';
import { news } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { extractContentFromUrl, buildFullContent } from '../services/readability.js';

const router = new Hono();

// GET /api/content?url=...  — extract content from external URL
router.get('/', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url query param is required' }, 400);

  try {
    const extracted = await extractContentFromUrl(url);
    return c.json(extracted);
  } catch (err: unknown) {
    const error = err as { message?: string };
    return c.json({ error: error.message || 'Failed to extract content' }, 500);
  }
});

// POST /api/content/news/:id — extract and save content for a news item
router.post('/news/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const [row] = await db.select().from(news).where(eq(news.id, id));
  if (!row) return c.json({ error: 'News not found' }, 404);

  const links = JSON.parse(row.links) as string[];
  if (!links.length) return c.json({ error: 'No links in this news item' }, 400);

  // Try the first link
  const url = links[0];
  try {
    const extracted = await extractContentFromUrl(url);
    const content = buildFullContent(extracted);
    const [updated] = await db.update(news).set({ fullContent: content }).where(eq(news.id, id)).returning();
    return c.json({ ...updated, fullContent: content });
  } catch (err: unknown) {
    const error = err as { message?: string };
    return c.json({ error: error.message || 'Failed to extract content' }, 500);
  }
});

export default router;
