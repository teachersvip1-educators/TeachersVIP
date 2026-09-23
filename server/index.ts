import { getConfig } from './config.js'
import { createPool } from './db/pool.js'
import { buildApp } from './app.js'
import { purgeExpiredExactLocationEvidence } from './deals/retention.js'
import { migrate } from './db/migrate.js'
import { seed } from './db/seed.js'

const config = getConfig()
const db = createPool(config)
// Some Railway services deploy from a root where railway.toml's pre-deploy
// command is not applied. Repair only an absent launch schema, rather than
// running migrations and seed data on every web-process restart.
const launchSchema = await db.query<{ ready: boolean }>(
  "SELECT to_regclass('public.city_deal_alerts') IS NOT NULL AND to_regclass('public.business_review_comments') IS NOT NULL AS ready",
)
if (!launchSchema.rows[0]?.ready) {
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
