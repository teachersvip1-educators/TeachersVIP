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

  it('keeps Creator Network interest submissions private, filterable, and separate from business campaigns', async () => {
    const sql = await readFile(new URL('../db/migrations/012_creator_network.sql', import.meta.url), 'utf8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS creator_network_submissions')
    expect(sql).toContain("status IN ('new','contacted','archived')")
    expect(sql).toContain('creator_network_city_idx')
    expect(sql).toContain('creator_network_platforms_idx')
    expect(sql).toContain('creator_network_niches_idx')
    expect(sql).not.toContain('business_applications')
  })

  it('requires Creator Network email confirmation before an admin can see a public submission', async () => {
    const sql = await readFile(new URL('../db/migrations/013_creator_network_email_verification.sql', import.meta.url), 'utf8')
    expect(sql).toContain('creator_network_email_verifications')
    expect(sql).toContain('email_verified_at')
    expect(sql).toContain('submitted_by_user_id')
  })

  it('stores moderated business feedback separately from completed purchases', async () => {
    const sql = await readFile(new URL('../db/migrations/014_business_reviews_and_activation_reporting.sql', import.meta.url), 'utf8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS business_reviews')
    expect(sql).toContain("status IN ('pending','approved','rejected')")
    expect(sql).toContain('activation_id uuid NOT NULL REFERENCES deal_activations')
    expect(sql).toContain('deal_activations_reporting_idx')
  })
})
