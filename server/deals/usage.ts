import type { DealLimitPeriod } from './contracts.js'

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: T[]; rowCount?: number | null }>
}

export interface UsageBucketInput {
  period: DealLimitPeriod
  at: Date
  timeZone: string
  promoStartsAt?: Date | string | null
  promoEndsAt?: Date | string | null
}

export interface UsageBucket {
  key: string | null
  timeZone: string
  period: DealLimitPeriod
}

function zonedDateParts(at: Date, timeZone: string): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at)
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value])) as Record<string, string>
  if (!values.year || !values.month || !values.day) throw new Error(`Unable to resolve timezone bucket for ${timeZone}.`)
  return { year: values.year, month: values.month, day: values.day }
}

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

/**
 * Builds a stable usage bucket. Day/month boundaries are evaluated in the
 * selected business location's IANA timezone, never in the API process zone.
 */
export function getUsageBucket(input: UsageBucketInput): UsageBucket {
  if (input.period === 'none') return { key: null, timeZone: input.timeZone, period: input.period }
  if (input.period === 'lifetime') return { key: 'lifetime', timeZone: input.timeZone, period: input.period }
  const parts = zonedDateParts(input.at, input.timeZone)
  if (input.period === 'day') return { key: `day:${parts.year}-${parts.month}-${parts.day}`, timeZone: input.timeZone, period: input.period }
  if (input.period === 'month') return { key: `month:${parts.year}-${parts.month}`, timeZone: input.timeZone, period: input.period }

  const startsAt = asDate(input.promoStartsAt)
  const endsAt = asDate(input.promoEndsAt)
  if (!startsAt || !endsAt || endsAt <= startsAt) throw new Error('A promotional usage limit requires a valid offer window.')
  if (input.at < startsAt || input.at >= endsAt) return { key: null, timeZone: input.timeZone, period: input.period }
  return { key: `promo:${startsAt.toISOString()}:${endsAt.toISOString()}`, timeZone: input.timeZone, period: input.period }
}

export function usageScopeKey(scope: 'offer' | 'location', locationId?: string | null): string {
  if (scope === 'location' && !locationId) throw new Error('A location-scoped limit requires a business location.')
  return scope === 'location' ? `location:${locationId}` : 'offer'
}

export interface ConsumeUsageInput {
  dealId: string
  userId: string
  scopeKey: string
  bucketKey: string
  limitCount: number | null
}

export interface ConsumeUsageResult {
  allowed: boolean
  usageCount: number
}

/** Calls the migration's atomic row-locking upsert. Call inside the activation transaction. */
export async function consumeUsageLimit(db: Queryable, input: ConsumeUsageInput): Promise<ConsumeUsageResult> {
  const result = await db.query<{ allowed: boolean; usage_count: number }>(
    'SELECT allowed, usage_count FROM consume_deal_usage_limit($1,$2,$3,$4,$5)',
    [input.dealId, input.userId, input.scopeKey, input.bucketKey, input.limitCount],
  )
  const row = result.rows[0]
  if (!row) throw new Error('Usage limit counter did not return a decision.')
  return { allowed: Boolean(row.allowed), usageCount: Number(row.usage_count) }
}
