import { getConfig } from './config.js'
import { createPool } from './db/pool.js'
import { buildApp } from './app.js'

const config = getConfig()
const db = createPool(config)
const app = buildApp({ config, db })

const shutdown = async () => { await app.close(); await db.end(); process.exit(0) }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

await app.listen({ host: '0.0.0.0', port: config.PORT })
