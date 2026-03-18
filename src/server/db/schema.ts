import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
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
  channelType: text('channel_type', { enum: ['none', 'link_continuation', 'media_content'] })
    .notNull()
    .default('none'),
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
  mediaSize: integer('media_size'),
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
