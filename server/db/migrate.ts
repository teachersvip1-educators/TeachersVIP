import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getConfig } from '../config.js'
import { createPool } from './pool.js'

export async function migrate() {
  const pool = createPool(getConfig())
  const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')
  const files = (await readdir(directory)).filter(file => file.endsWith('.sql')).sort()
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
