/**
 * Zod schemas for all API request bodies.
 *
 * Shared between server (validation) and client (type inference).
 * Server-only helpers (parseOptionalBody) remain in src/server/routes/schemas.ts.
 */

import { z } from 'zod';

// ─── Channels ─────────────────────────────────────────────────────────────────

export const createChannelSchema = z.object({
  telegramId: z.string().min(1, 'telegramId is required'),
  name: z.string().min(1, 'name is required'),
  description: z.string().optional(),
  channelType: z.enum(['news', 'news_link', 'media', 'blog']).optional(),
  groupId: z.number().nullable().optional(),
});

export const updateChannelSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  channelType: z.enum(['news', 'news_link', 'media', 'blog']).optional(),
  groupId: z.number().nullable().optional(),
  lastFetchedAt: z.number().optional(),
});

export const reorderItemsSchema = z.object({
  items: z.array(z.object({ id: z.number(), sortOrder: z.number() })),
});

export const fetchChannelSchema = z.object({
  since: z.string().optional(),
  limit: z.number().optional(),
});

// ─── News ─────────────────────────────────────────────────────────────────────

export const readAllNewsSchema = z.object({
  channelId: z.number().optional(),
  newsIds: z.array(z.number()).optional(),
});

export const markReadSchema = z.object({
  isRead: z.number().optional(),
});

// ─── Groups ───────────────────────────────────────────────────────────────────

export const createGroupSchema = z.object({
  name: z.string().min(1, 'name is required'),
  color: z.string().optional(),
  pin: z.string().optional(),
  sortOrder: z.number().optional(),
});

export const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().optional(),
  pin: z.string().nullable().optional(),
  sortOrder: z.number().optional(),
});

export const verifyPinSchema = z.object({
  pin: z.string(),
});

// ─── Filters ──────────────────────────────────────────────────────────────────

export const createFilterSchema = z.object({
  name: z.string().min(1, 'name is required'),
  type: z.enum(['tag', 'keyword']),
  value: z.string().min(1, 'value is required'),
});

export const updateFilterSchema = z.object({
  name: z.string().optional(),
  type: z.enum(['tag', 'keyword']).optional(),
  value: z.string().optional(),
  isActive: z.number().optional(),
});

// ─── Downloads ────────────────────────────────────────────────────────────────

export const createDownloadSchema = z.object({
  newsId: z.number({ error: 'newsId is required' }),
  type: z.enum(['media', 'article'], { error: 'type is required' }),
  url: z.string().optional(),
  priority: z.number().optional(),
});

// ─── Digest ───────────────────────────────────────────────────────────────────

export const createDigestSchema = z.object({
  channelIds: z.array(z.number()).optional(),
  groupId: z.number().nullable().optional(),
  since: z.string().optional(),
  until: z.string().optional(),
  /** When provided, generate digest only for these specific news IDs (e.g. tag-filtered view) */
  newsIds: z.array(z.number()).optional(),
});

// ─── Client Log ───────────────────────────────────────────────────────────────

export const clientLogSchema = z.object({
  entries: z.array(
    z
      .object({
        level: z.enum(['warn', 'error']),
        module: z.unknown().optional(),
        msg: z.string().optional(),
        time: z.number().optional(),
        url: z.string().optional(),
      })
      .passthrough(),
  ),
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
  totpCode: z.string().optional(),
});

export const totpConfirmSchema = z.object({
  secret: z.string().min(1),
  code: z.string().min(1),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type FetchChannelInput = z.infer<typeof fetchChannelSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type CreateFilterInput = z.infer<typeof createFilterSchema>;
export type UpdateFilterInput = z.infer<typeof updateFilterSchema>;
export type CreateDownloadInput = z.infer<typeof createDownloadSchema>;
export type CreateDigestInput = z.infer<typeof createDigestSchema>;
