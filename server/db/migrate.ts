import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfig } from '../config.js'
import { createPool } from './pool.js'
import type { DbPool } from './pool.js'

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')
const migrationFiles = async () => (await readdir(directory)).filter(file => file.endsWith('.sql')).sort()

export async function hasPendingMigrations(db: DbPool) {
  const files = await migrationFiles()
  const registry = await db.query<{ exists: string | null }>("SELECT to_regclass('public.schema_migrations') AS exists")
  if (!registry.rows[0]?.exists) return true
  const applied = await db.query<{ name: string }>('SELECT name FROM schema_migrations')
  const names = new Set(applied.rows.map(row => row.name))
  return files.some(file => !names.has(file))
}

export async function migrate() {
  const pool = createPool(getConfig())
  const files = await migrationFiles()
  const client = await pool.connect()
  let locked = false
  try {
    await client.query('SELECT pg_advisory_lock(900017, 1)')
    locked = true
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    for (const file of files) {
      const exists = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file])
      if (exists.rowCount) continue
      await client.query('BEGIN')
      await client.query(await readFile(path.join(directory, file), 'utf8'))
      await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file])
      await client.query('COMMIT')
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock(900017, 1)')
    } finally {
      client.release()
      await pool.end()
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  migrate().then(() => console.log('Database migrations complete.')).catch(error => { console.error(error); process.exit(1) })
}
