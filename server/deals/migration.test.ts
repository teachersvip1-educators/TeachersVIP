import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('business location and activation migration contract', () => {
  it('keeps historical self-reports separate and installs atomic activation primitives', async () => {
    const sql = await readFile(new URL('../db/migrations/010_business_locations_and_activations.sql', import.meta.url), 'utf8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS business_applications')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS business_application_locations')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS business_locations')
    expect(sql).toContain("b.id || ':primary'")
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS deal_locations')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS deal_activations')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS deal_usage_counters')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION consume_deal_usage_limit')
    expect(sql).toContain('exact_location_expires_at')
    expect(sql).not.toContain('DELETE FROM deal_use_reports')
    expect(sql).not.toContain('INSERT INTO deal_activations SELECT')
  })

  it('adds first-agreement lifetime limits and persistent communication preferences', async () => {
    const sql = await readFile(new URL('../db/migrations/011_first_agreement_completion.sql', import.meta.url), 'utf8')
    expect(sql).toContain("'lifetime'")
    expect(sql).toContain('newsletter_subscriptions')
    expect(sql).toContain('email_updates')
    expect(sql).not.toContain('Educator Partner Offer')
  })
})
