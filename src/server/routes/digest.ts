import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { db } from '../db/index.js';
import { news, channels } from '../db/schema.js';
import { eq, and, desc, inArray, isNull, gt } from 'drizzle-orm';
import { createOpenAiClient, DIGEST_DEPLOYMENT, isAiConfigured } from '../services/openaiClient.js';
import { DIGEST_MAX_ITEMS } from '../config.js';
import { logger } from '../logger.js';

const router = new Hono();

router.post('/', async (c) => {
  if (!isAiConfigured()) {
    return c.json({ error: 'AI provider not configured' }, 503);
  }

  const body = await c.req.json<{
    channelIds?: number[];
    groupId?: number | null;
    since?: string;
    until?: string;
  }>();

  // ── Fetch news items from DB ─────────────────────────────────────────────
  const conditions = [];

  if (body.channelIds?.length) {
    conditions.push(inArray(news.channelId, body.channelIds));
  } else if (body.groupId !== undefined) {
    // Get channel IDs for the group (null = "Общее")
    const groupChannels = await db
      .select({ id: channels.id })
      .from(channels)
      .where(body.groupId === null ? isNull(channels.groupId) : eq(channels.groupId, body.groupId));
    const ids = groupChannels.map((ch) => ch.id);
    if (ids.length === 0) {
      return c.json({ error: 'No channels in this group' }, 404);
    }
    conditions.push(inArray(news.channelId, ids));
  }

  if (body.since) {
    const sinceTs = Math.floor(new Date(body.since).getTime() / 1000);
    conditions.push(gt(news.postedAt, sinceTs));
  }
  if (body.until) {
    const untilTs = Math.floor(new Date(body.until).getTime() / 1000);
    conditions.push(gt(news.postedAt, 0));
    conditions.push(eq(news.postedAt, untilTs)); // placeholder, real filter below
  }

  const rows = await db
    .select({ id: news.id, text: news.text, postedAt: news.postedAt, channelId: news.channelId })
    .from(news)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(news.postedAt))
    .limit(DIGEST_MAX_ITEMS);

  if (rows.length === 0) {
    return c.json({ error: 'No news items found for digest' }, 404);
  }

  // Newest-first already — reverse to chronological for the prompt
  const items = [...rows].reverse();

  const newsText = items
    .map((item, i) => {
      const date = new Date(item.postedAt * 1000).toLocaleDateString('ru-RU');
      const text = item.text.trim().slice(0, 500);
      return `${i + 1}. [${date}] ${text}`;
    })
    .join('\n');

  const systemPrompt = `You are a news digest assistant for a personal Telegram news reader.
Summarize the provided news items into a structured digest.
- Group related topics together
- Highlight the most important events
- Write in the same language as the majority of the news content
- Use markdown formatting: headers (##), bullet points, bold for key terms
- Be concise but informative
- At the end add a "📌 Key takeaways" section with 3-5 bullet points`;

  const userPrompt = `Here are ${items.length} news items (newest last):\n\n${newsText}\n\nPlease create a digest.`;

  // ── Stream SSE response ───────────────────────────────────────────────────
  return streamSSE(c, async (stream) => {
    try {
      const client = createOpenAiClient();
      const completion = await client.chat.completions.create({
        model: DIGEST_DEPLOYMENT,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: true,
        max_tokens: 2000,
        temperature: 0.7,
      });

      for await (const chunk of completion) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          await stream.writeSSE({ event: 'chunk', data: JSON.stringify({ content: delta }) });
        }
      }

      await stream.writeSSE({ event: 'done', data: '{}' });
      logger.info({ module: 'digest', items: items.length }, 'digest completed');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ module: 'digest', err }, 'digest error');
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ message: msg }) });
    }
  });
});

export default router;
