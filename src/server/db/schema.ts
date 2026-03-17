import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const channels = sqliteTable('channels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  telegramId: text('telegram_id').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  channelType: text('channel_type', { enum: ['none', 'link_continuation', 'media_content'] })
    .notNull()
    .default('none'),
  lastFetchedAt: integer('last_fetched_at'),
  lastReadAt: integer('last_read_at'),
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
