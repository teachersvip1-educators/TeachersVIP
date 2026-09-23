import { getConfig } from './config.js'
import { createPool } from './db/pool.js'
import { buildApp } from './app.js'
import { purgeExpiredExactLocationEvidence } from './deals/retention.js'
import { hasPendingMigrations, migrate } from './db/migrate.js'
import { seed } from './db/seed.js'

const config = getConfig()
const db = createPool(config)
// Some Railway services do not apply railway.toml's pre-deploy command.
// Only reconcile when a migration file is unapplied; ordinary restarts stay read-only.
if (await hasPendingMigrations(db)) {
  await migrate()
  await seed()
}
const app = buildApp({ config, db })

const purgeLocations = () => void purgeExpiredExactLocationEvidence(db).catch(error => app.log.error({ error }, 'Location retention cleanup failed'))
const retentionTimer = setInterval(purgeLocations, 6 * 60 * 60 * 1000)
retentionTimer.unref()
const shutdown = async () => { clearInterval(retentionTimer); await app.close(); await db.end(); process.exit(0) }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

await app.listen({ host: '0.0.0.0', port: config.PORT })
purgeLocations()
