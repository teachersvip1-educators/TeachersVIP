export const OFFER_CTA_LABELS = {
  use_deal: 'Use Deal',
  join_waitlist: 'Join Waitlist',
  rsvp: 'RSVP',
  get_launch_invite: 'Get Launch Invite',
} as const

export type OfferCtaType = keyof typeof OFFER_CTA_LABELS
export const OFFER_RESPONSE_LABELS: Record<OfferCtaType, string> = {
  use_deal: 'Offer access',
  join_waitlist: 'Waitlist joined',
  rsvp: 'RSVP confirmed',
  get_launch_invite: 'Invitation requested',
}
export const isInterestCta = (cta?: OfferCtaType) => Boolean(cta && cta !== 'use_deal')
