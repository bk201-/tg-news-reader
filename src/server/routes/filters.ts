import { Hono } from 'hono';
import { db } from '../db/index.js';
import { filters } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const router = new Hono();

// GET /api/channels/:channelId/filters
router.get('/', async (c) => {
  const channelId = parseInt(c.req.param('channelId')!, 10);
  const result = await db.select().from(filters).where(eq(filters.channelId, channelId)).orderBy(filters.createdAt);
  return c.json(result);
});

// POST /api/channels/:channelId/filters
router.post('/', async (c) => {
  const channelId = parseInt(c.req.param('channelId')!, 10);
  const body = await c.req.json<{ name: string; type: 'tag' | 'keyword'; value: string }>();
  if (!body.name || !body.type || !body.value) {
    return c.json({ error: 'name, type, and value are required' }, 400);
  }
  const [created] = await db
    .insert(filters)
    .values({
      channelId,
      name: body.name.trim(),
      type: body.type,
      value: body.value.trim().toLowerCase(),
    })
    .returning();
  return c.json(created, 201);
});

// PUT /api/channels/:channelId/filters/:id
router.put('/:id', async (c) => {
  const channelId = parseInt(c.req.param('channelId')!, 10);
  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json<{
    name?: string;
    type?: 'tag' | 'keyword';
    value?: string;
    isActive?: number;
  }>();
  const [updated] = await db
    .update(filters)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.value !== undefined && { value: body.value.toLowerCase() }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    })
    .where(and(eq(filters.id, id), eq(filters.channelId, channelId)))
    .returning();
  if (!updated) return c.json({ error: 'Filter not found' }, 404);
  return c.json(updated);
});

// DELETE /api/channels/:channelId/filters/:id
router.delete('/:id', async (c) => {
  const channelId = parseInt(c.req.param('channelId')!, 10);
  const id = parseInt(c.req.param('id'), 10);
  const [deleted] = await db
    .delete(filters)
    .where(and(eq(filters.id, id), eq(filters.channelId, channelId)))
    .returning();
  if (!deleted) return c.json({ error: 'Filter not found' }, 404);
  return c.json({ success: true });
});

export default router;
