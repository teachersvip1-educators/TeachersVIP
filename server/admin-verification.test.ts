import { describe, expect, it, vi } from 'vitest'
import { buildApp } from './app'
import { getConfig } from './config'
import type { DbPool } from './db/pool'

const caseId = '11111111-1111-4111-8111-111111111111'
const config = getConfig({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://test:test@localhost:5432/test', APP_URL: 'http://localhost:8443', SESSION_SECRET: 'test-session-secret-at-least-32-characters', DATA_ENCRYPTION_KEY: '11'.repeat(32), RESEND_API_KEY: undefined, PASS2U_API_KEY: undefined, PASS2U_MODEL_ID: undefined })

describe('manual educator decisions', () => {
  for (const action of ['approve', 'reject'] as const) {
    it(`${action}s a pending case with notes and records the decision`, async () => {
      const transaction = vi.fn(async (sql: string) => ({ rows: sql.startsWith('SELECT user_id') ? [{ user_id: 'member-id', work_email: 'member@example.com', status: 'manual_review' }] : [] }))
      const release = vi.fn()
      const db = { query: vi.fn(async () => ({ rows: [{ id: 'admin-id', personal_email: 'admin@example.com', is_superadmin: true, is_demo: false }] })), connect: vi.fn(async () => ({ query: transaction, release })) } as unknown as DbPool
      const app = buildApp({ config, db })
      try {
        const response = await app.inject({ method: 'PATCH', url: `/api/admin/verifications/${caseId}`, headers: { cookie: 'teachersvip_session=test' }, payload: { action, notes: 'Evidence reviewed.' } })
        expect(response.statusCode).toBe(200)
        expect(response.json()).toMatchObject({ ok: true, status: action === 'approve' ? 'verified' : 'rejected' })
        expect(transaction.mock.calls.some(([sql]) => sql.includes('INSERT INTO educator_verification_audits'))).toBe(true)
        expect(transaction.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true)
        expect(release).toHaveBeenCalled()
      } finally { await app.close() }
    })
  }
})
