import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';
import { mkdirSync } from 'fs';
import { join } from 'path';

const dataDir = join(process.cwd(), 'data');
mkdirSync(dataDir, { recursive: true });

// file: URL — forward slashes required, works on Windows too
const dbPath = join(dataDir, 'db.sqlite').replace(/\\/g, '/');

export const client = createClient({ url: `file:${dbPath}` });
await client.execute('PRAGMA foreign_keys = ON');
export const db = drizzle(client, { schema });
