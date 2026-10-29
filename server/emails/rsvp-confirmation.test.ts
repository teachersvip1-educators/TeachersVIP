import { describe, expect, it } from 'vitest'
import { rsvpConfirmationEmail } from './rsvp-confirmation'

const submission = { id: 'ec27c73f-46f1-4d60-bdb9-a01d045899cd', first_name: 'Avery', email: 'personal@example.test', event_name: 'Teacher Celebration', event_date_time: 'November 14, 2026 at 6 PM CT', event_location: 'Main Hall, Houston, Texas' }
describe('RSVP confirmation email', () => {
  it('uses the supplied copy and fills every placeholder', () => {
    const email = rsvpConfirmationEmail(submission, 'https://teachersvip.net')
    expect(email.text).toBe(`Hi Avery,

Your RSVP is confirmed! We’re excited to celebrate with you and welcome you to this special event.

You’re part of a community that believes teachers deserve to feel appreciated, supported, and included. We can’t wait for you to connect, enjoy the celebration, and experience what’s ahead.

Event: Teacher Celebration
Date and time: November 14, 2026 at 6 PM CT
Location: Main Hall, Houston, Texas

We’ll send you any important updates before the event. If your plans change, please update your RSVP here: https://teachersvip.net/rsvp/ec27c73f-46f1-4d60-bdb9-a01d045899cd.

We’re glad you’ll be there!

Warmly,
The TeachersVIP Team
Educate. Support. Enjoy.`)
    expect(email.html).toContain('href="https://teachersvip.net/rsvp/ec27c73f-46f1-4d60-bdb9-a01d045899cd"')
    expect(email.subject).toContain('Teacher Celebration')
  })
  it('does not invent date or location details', () => {
    const email = rsvpConfirmationEmail({ ...submission, event_date_time: null, event_location: '' }, 'https://teachersvip.net/')
    expect(email.text).toContain('Date and time: To be announced\nLocation: To be announced')
    expect(email.text).not.toContain('.net//')
  })
  it('escapes member and event content in HTML while retaining readable plain text', () => {
    const email = rsvpConfirmationEmail({ ...submission, first_name: '<Avery>', event_name: 'Teachers & Friends <script>' }, 'https://teachersvip.net')
    expect(email.html).toContain('&lt;Avery&gt;')
    expect(email.html).toContain('Teachers &amp; Friends &lt;script&gt;')
    expect(email.html).not.toContain('<script>')
    expect(email.text).toContain('Hi <Avery>,')
  })
})
