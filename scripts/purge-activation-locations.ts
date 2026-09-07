import { createPool } from "../server/db/pool.js"
import { getConfig } from "../server/config.js"
import { purgeExpiredExactLocationEvidence } from "../server/deals/retention.js"

const pool = createPool(getConfig())

try {
  const purged = await purgeExpiredExactLocationEvidence(pool)
  console.log(
    `Removed exact coordinates from ${purged} expired activation record${
      purged === 1 ? "" : "s"
    }.`,
  )
} finally {
  await pool.end()
}
