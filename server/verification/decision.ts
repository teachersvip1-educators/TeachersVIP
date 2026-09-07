import { isPersonalEmailDomain, normalizeEmail, type PublicSuffixResolver } from './domain.js'
import type { DomainEvidence, EducatorRole, VerificationDecision } from './types.js'

export const VERIFICATION_REASON_CODES = {
  INVALID_WORK_EMAIL: 'INVALID_WORK_EMAIL',
  PERSONAL_EMAIL_PROVIDER: 'PERSONAL_EMAIL_PROVIDER',
  UNKNOWN_DOMAIN: 'UNKNOWN_DOMAIN',
  SHARED_STAFF_STUDENT_DOMAIN: 'SHARED_STAFF_STUDENT_DOMAIN',
  DOMAIN_NOT_REVIEWED: 'DOMAIN_NOT_REVIEWED',
  DOMAIN_BLOCKED: 'DOMAIN_BLOCKED',
  ROLE_MISMATCH: 'ROLE_MISMATCH',
  TEST_MODE: 'TEST_MODE',
} as const

/**
 * Controlled pilot path: still requires a valid email-link confirmation, but
 * deliberately skips reviewed-domain evidence so invited testers can use any
 * email provider. Keep this behind VERIFICATION_TEST_MODE and disable it
 * before public launch.
 */
export function decideVerificationForTestMode(
  email: string,
  resolver?: PublicSuffixResolver,
): VerificationDecision {
  const parsed = normalizeEmail(email, resolver)
  if (!parsed) {
    return {
      status: 'manual_review',
      automatic: false,
      reasonCodes: [VERIFICATION_REASON_CODES.INVALID_WORK_EMAIL],
      normalizedEmail: email.trim().toLowerCase(),
      normalizedDomain: '',
      registrableDomain: '',
    }
  }
  return {
    status: 'verified',
    automatic: false,
    reasonCodes: [VERIFICATION_REASON_CODES.TEST_MODE],
    normalizedEmail: parsed.email,
    normalizedDomain: parsed.hostname,
    registrableDomain: parsed.registrableDomain,
  }
}

/**
 * Automatic approval is intentionally narrow: only a reviewed staff-only
 * domain with explicit role coverage can pass. Every other outcome is manual
 * review, including personal and unknown domains (never an automatic denial).
 */
export function decideVerification(
  email: string,
  selectedRole: EducatorRole,
  evidence: DomainEvidence | null | undefined,
  resolver?: PublicSuffixResolver,
): VerificationDecision {
  const parsed = normalizeEmail(email, resolver)
  if (!parsed) {
    return {
      status: 'manual_review',
      automatic: false,
      reasonCodes: [VERIFICATION_REASON_CODES.INVALID_WORK_EMAIL],
      normalizedEmail: email.trim().toLowerCase(),
      normalizedDomain: '',
      registrableDomain: '',
    }
  }

  if (isPersonalEmailDomain(parsed.hostname, resolver)) {
    return manual(parsed, VERIFICATION_REASON_CODES.PERSONAL_EMAIL_PROVIDER)
  }
  if (!evidence) return manual(parsed, VERIFICATION_REASON_CODES.UNKNOWN_DOMAIN)

  if (evidence.decision === 'blocked') return manual(parsed, VERIFICATION_REASON_CODES.DOMAIN_BLOCKED)
  if (evidence.classification === 'shared_staff_student') {
    return manual(parsed, VERIFICATION_REASON_CODES.SHARED_STAFF_STUDENT_DOMAIN)
  }
  if (evidence.classification !== 'staff_only' || evidence.decision !== 'auto_eligible' || !evidence.reviewedAt || !evidence.evidence?.trim()) {
    return manual(parsed, VERIFICATION_REASON_CODES.DOMAIN_NOT_REVIEWED)
  }
  const roleAllowed = evidence.eligibleRole === 'both' || evidence.eligibleRole === selectedRole
  if (!roleAllowed) return manual(parsed, VERIFICATION_REASON_CODES.ROLE_MISMATCH)

  return {
    status: 'verified',
    automatic: true,
    reasonCodes: [],
    normalizedEmail: parsed.email,
    normalizedDomain: parsed.hostname,
    registrableDomain: parsed.registrableDomain,
  }
}

function manual(parsed: NonNullable<ReturnType<typeof normalizeEmail>>, reason: string): VerificationDecision {
  return {
    status: 'manual_review',
    automatic: false,
    reasonCodes: [reason],
    normalizedEmail: parsed.email,
    normalizedDomain: parsed.hostname,
    registrableDomain: parsed.registrableDomain,
  }
}
