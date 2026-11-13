import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const migrationUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!migrationUrl) throw new Error('MIGRATION_DATABASE_URL or DATABASE_URL is required');
const pool = new Pool({ connectionString: migrationUrl, max: 1 });

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));
const lockId = 73412019;
const client = await pool.connect();

try {
  await client.query('SELECT pg_advisory_lock($1)', [lockId]);
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const files = (await readdir(migrationsDir)).filter(name => /^\d+_.*\.sql$/.test(name)).sort();
  for (const name of files) {
    const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (applied.rowCount) continue;
    const sql = await readFile(resolve(migrationsDir, name), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Applied migration ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} catch (error) {
  console.error('Migration failed', error);
  process.exitCode = 1;
} finally {
  await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
  client.release();
  await pool.end();
}
