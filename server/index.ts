import { getConfig } from './config.js'
import { createPool } from './db/pool.js'
import { buildApp } from './app.js'
import { purgeExpiredExactLocationEvidence } from './deals/retention.js'

const config = getConfig()
const db = createPool(config)
const app = buildApp({ config, db })

const purgeLocations = () => void purgeExpiredExactLocationEvidence(db).catch(error => app.log.error({ error }, 'Location retention cleanup failed'))
const retentionTimer = setInterval(purgeLocations, 6 * 60 * 60 * 1000)
retentionTimer.unref()
const shutdown = async () => { clearInterval(retentionTimer); await app.close(); await db.end(); process.exit(0) }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

await app.listen({ host: '0.0.0.0', port: config.PORT })
purgeLocations()
