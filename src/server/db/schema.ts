import { sqliteTable, integer, text, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const groups = sqliteTable('groups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  color: text('color').notNull().default('#1677ff'),
  pinHash: text('pin_hash'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export const channels = sqliteTable('channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telegramId: text('telegram_id').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  channelType: text('channel_type', { enum: ['news', 'news_link', 'media', 'blog'] })
    .notNull()
    .default('news'),
  groupId: integer('group_id').references(() => groups.id, { onDelete: 'set null' }),
  sortOrder: integer('sort_order').notNull().default(0),
  lastFetchedAt: integer('last_fetched_at'),
  lastReadAt: integer('last_read_at'),
  isUnavailable: integer('is_unavailable').notNull().default(0),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export const news = sqliteTable('news', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channelId: integer('channel_id')
    .notNull()
    .references(() => channels.id, { onDelete: 'cascade' }),
  telegramMsgId: integer('telegram_msg_id').notNull(),
  text: text('text').notNull().default(''),
  links: text('links').notNull().default('[]'),
  hashtags: text('hashtags').notNull().default('[]'),
  mediaType: text('media_type'),
  isRead: integer('is_read').notNull().default(0),
  postedAt: integer('posted_at').notNull(),
  fullContent: text('full_content'),
  localMediaPath: text('local_media_path'),
  localMediaPaths: text('local_media_paths'), // JSON array of paths for albums, e.g. ["ch/101.jpg","ch/102.jpg"]
  albumMsgIds: text('album_msg_ids'), // JSON array of telegram msg IDs, e.g. [101,102,103]
  mediaSize: integer('media_size'),
  isFiltered: integer('is_filtered').notNull().default(0),
  textInPanel: integer('text_in_panel').notNull().default(0),
  canLoadArticle: integer('can_load_article').notNull().default(0),
});

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  totpSecret: text('totp_secret'), // null = 2FA disabled
  role: text('role').notNull().default('admin'),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // UUID v4
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  expiresAt: integer('expires_at').notNull(), // unixepoch
  unlockedGroupIds: text('unlocked_group_ids').notNull().default('[]'), // JSON array
  userAgent: text('user_agent'),
  ip: text('ip'),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export const downloads = sqliteTable('downloads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  newsId: integer('news_id')
    .notNull()
    .references(() => news.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['media', 'article'] }).notNull(),
  url: text('url'),
  priority: integer('priority').notNull().default(0),
  status: text('status', { enum: ['pending', 'processing', 'done', 'failed'] })
    .notNull()
    .default('pending'),
  error: text('error'),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
  processedAt: integer('processed_at'),
});

export const filters = sqliteTable('filters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channelId: integer('channel_id')
    .notNull()
    .references(() => channels.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type', { enum: ['tag', 'keyword'] }).notNull(),
  value: text('value').notNull(),
  isActive: integer('is_active').notNull().default(1),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(unixepoch())`),
});

export const filterStats = sqliteTable(
  'filter_stats',
  {
    filterId: integer('filter_id')
      .notNull()
      .references(() => filters.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // 'YYYY-MM-DD'
    hitCount: integer('hit_count').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.filterId, table.date] })],
);
