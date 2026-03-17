import { client } from './index.js';
await client.execute('PRAGMA foreign_keys = ON');
await client.executeMultiple(`
  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    channel_type TEXT NOT NULL DEFAULT 'none',
    last_fetched_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    telegram_msg_id INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    links TEXT NOT NULL DEFAULT '[]',
    hashtags TEXT NOT NULL DEFAULT '[]',
    media_type TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    posted_at INTEGER NOT NULL,
    full_content TEXT,
    local_media_path TEXT,
    UNIQUE(channel_id, telegram_msg_id)
  );
  CREATE INDEX IF NOT EXISTS idx_news_channel_id ON news(channel_id);
  CREATE INDEX IF NOT EXISTS idx_news_is_read ON news(is_read);
  CREATE INDEX IF NOT EXISTS idx_news_posted_at ON news(posted_at);
  CREATE TABLE IF NOT EXISTS filters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('tag', 'keyword')),
    value TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);
const alterMigrations = [
  "ALTER TABLE channels ADD COLUMN channel_type TEXT NOT NULL DEFAULT 'none'",
  'ALTER TABLE news ADD COLUMN local_media_path TEXT',
  'ALTER TABLE news ADD COLUMN media_size INTEGER',
  'ALTER TABLE filters ADD COLUMN channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE',
  'ALTER TABLE channels ADD COLUMN last_read_at INTEGER',
];
for (const sql of alterMigrations) {
  try {
    await client.execute(sql);
  } catch {
    // Column already exists
  }
}

// One-time: bind filters that have no channel_id to the first channel
await client.execute(
  `UPDATE filters SET channel_id = (SELECT id FROM channels ORDER BY id LIMIT 1)
   WHERE channel_id IS NULL AND EXISTS (SELECT 1 FROM channels)`,
);
console.log('✅ Database migrated successfully');
