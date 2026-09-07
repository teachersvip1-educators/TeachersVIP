import { describe, expect, it } from 'vitest'
import { decideVerification, decideVerificationForTestMode, VERIFICATION_REASON_CODES } from './decision.js'
import { isPersonalEmailDomain, normalizeDomain, normalizeEmail } from './domain.js'

const reviewedK12 = {
  normalizedDomain: 'district.edu',
  registrableDomain: 'district.edu',
  classification: 'staff_only' as const,
  decision: 'auto_eligible' as const,
  eligibleRole: 'K-12 educator' as const,
  evidence: 'District IT policy states this domain is reserved for staff.',
  reviewedAt: '2026-09-01T00:00:00Z',
}

describe('educator domain normalization', () => {
  it('normalizes case, trailing dots, and IDN domains with the Public Suffix List', () => {
    expect(normalizeDomain('  Staff.Example.EDU. ')).toMatchObject({ hostname: 'staff.example.edu', registrableDomain: 'example.edu', usedPublicSuffixResolver: true })
    expect(normalizeEmail('Teacher@Staff.Example.EDU.')?.email).toBe('teacher@staff.example.edu')
    expect(normalizeDomain('not a domain')).toBeNull()
  })

  it('uses the supplied PSL resolver for registrable domains', () => {
    const resolver = { registrableDomain: (host: string) => host.endsWith('.sch.uk') ? host.split('.').slice(-3).join('.') : host }
    expect(normalizeDomain('teacher.school.sch.uk', resolver)).toMatchObject({ registrableDomain: 'school.sch.uk', usedPublicSuffixResolver: true })
  })

  it('recognizes personal providers', () => {
    expect(isPersonalEmailDomain('gmail.com')).toBe(true)
    expect(isPersonalEmailDomain('district.edu')).toBe(false)
  })
})

describe('educator verification decisions', () => {
  it('automatically verifies only reviewed staff-only domains with matching role', () => {
    const result = decideVerification('teacher@district.edu', 'K-12 educator', reviewedK12)
    expect(result).toMatchObject({ status: 'verified', automatic: true, reasonCodes: [] })
  })

  it('sends a college professor with a shared campus domain to manual review', () => {
    const result = decideVerification('professor@university.edu', 'College professor', { ...reviewedK12, classification: 'shared_staff_student', normalizedDomain: 'university.edu' })
    expect(result).toMatchObject({ status: 'manual_review', automatic: false, reasonCodes: [VERIFICATION_REASON_CODES.SHARED_STAFF_STUDENT_DOMAIN] })
  })

  it('sends personal, unknown, and role-mismatched domains to manual review, not automatic denial', () => {
    expect(decideVerification('teacher@gmail.com', 'K-12 educator', null).reasonCodes).toEqual([VERIFICATION_REASON_CODES.PERSONAL_EMAIL_PROVIDER])
    expect(decideVerification('teacher@unknown.example', 'K-12 educator', null).reasonCodes).toEqual([VERIFICATION_REASON_CODES.UNKNOWN_DOMAIN])
    expect(decideVerification('professor@district.edu', 'College professor', reviewedK12).reasonCodes).toEqual([VERIFICATION_REASON_CODES.ROLE_MISMATCH])
  })

  it('requires evidence and review timestamp before auto eligibility', () => {
    const result = decideVerification('teacher@district.edu', 'K-12 educator', { ...reviewedK12, evidence: '', reviewedAt: null })
    expect(result).toMatchObject({ status: 'manual_review', reasonCodes: [VERIFICATION_REASON_CODES.DOMAIN_NOT_REVIEWED] })
  })

  it('allows any valid email in controlled test mode while retaining email ownership', () => {
    const result = decideVerificationForTestMode('tester@gmail.com')
    expect(result).toMatchObject({ status: 'verified', automatic: false, reasonCodes: [VERIFICATION_REASON_CODES.TEST_MODE] })
  })
})
