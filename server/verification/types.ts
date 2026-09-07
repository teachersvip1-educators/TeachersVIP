export type EducatorRole = 'K-12 educator' | 'College professor'
export type DomainClassification = 'staff_only' | 'shared_staff_student' | 'personal_provider' | 'unknown'
export type DomainDecision = 'auto_eligible' | 'manual_review' | 'blocked'
export type VerificationStatus = 'email_pending' | 'manual_review' | 'verified' | 'rejected' | 'suspended'

export type DomainEvidence = {
  normalizedDomain: string
  registrableDomain: string
  classification: DomainClassification
  decision: DomainDecision
  eligibleRole?: EducatorRole | 'both' | null
  evidence?: string | null
  evidenceUrl?: string | null
  reviewedAt?: string | Date | null
}

export type VerificationDecision = {
  status: 'verified' | 'manual_review'
  automatic: boolean
  reasonCodes: string[]
  normalizedEmail: string
  normalizedDomain: string
  registrableDomain: string
}
