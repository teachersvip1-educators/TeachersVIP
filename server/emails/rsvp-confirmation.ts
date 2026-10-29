export interface RsvpConfirmation {
  id: string
  first_name: string
  email: string
  event_name: string
  event_date_time?: string | null
  event_location?: string | null
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)

export function rsvpConfirmationEmail(submission: RsvpConfirmation, appUrl: string) {
  const manageUrl = `${appUrl.replace(/\/$/, '')}/rsvp/${encodeURIComponent(submission.id)}`
  const text = `Hi ${submission.first_name.trim() || 'there'},

Your RSVP is confirmed! We’re excited to celebrate with you and welcome you to this special event.

You’re part of a community that believes teachers deserve to feel appreciated, supported, and included. We can’t wait for you to connect, enjoy the celebration, and experience what’s ahead.

Event: ${submission.event_name}
Date and time: ${submission.event_date_time?.trim() || 'To be announced'}
Location: ${submission.event_location?.trim() || 'To be announced'}

We’ll send you any important updates before the event. If your plans change, please update your RSVP here: ${manageUrl}.

We’re glad you’ll be there!

Warmly,
The TeachersVIP Team
Educate. Support. Enjoy.`
  const body = escapeHtml(text).replace(escapeHtml(manageUrl), `<a href="${escapeHtml(manageUrl)}" style="color:#8a6d1a">${escapeHtml(manageUrl)}</a>`).replace(/\n/g, '<br>')
  return {
    subject: `Your RSVP is confirmed! — ${submission.event_name}`,
    text,
    html: `<!doctype html><html><body style="margin:0;padding:24px;background:#eef2f7;color:#0f172a;font-family:Arial,sans-serif"><main style="max-width:600px;margin:auto;padding:32px;background:#fff;border-radius:18px;border-top:4px solid #d4af37;font-size:16px;line-height:1.65">${body}</main></body></html>`,
  }
}
