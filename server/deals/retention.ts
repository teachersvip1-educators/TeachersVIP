import type { Queryable } from './usage.js'

/**
 * Scheduled maintenance hook: removes exact encrypted browser coordinates once
 * their short audit window ends while retaining distance, outcome, and location
 * identifiers for aggregate reporting.
 */
export async function purgeExpiredExactLocationEvidence(db: Queryable, now = new Date()): Promise<number> {
  const result = await db.query(
    `UPDATE deal_activations
     SET submitted_latitude_encrypted=NULL, submitted_longitude_encrypted=NULL
     WHERE exact_location_expires_at <= $1
       AND (submitted_latitude_encrypted IS NOT NULL OR submitted_longitude_encrypted IS NOT NULL)`,
    [now],
  )
  return Number(result.rowCount ?? 0)
}
