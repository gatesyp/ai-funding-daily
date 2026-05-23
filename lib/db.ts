import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../db/schema';

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set in environment');
    const sql = neon(url);
    _db = drizzle(sql, { schema });
  }
  return _db;
}

export const db = new Proxy({} as any, {
  get(_target, prop) {
    return getDb()[prop as keyof ReturnType<typeof getDb>];
  },
});
