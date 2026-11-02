-- Batters & Brunch requires an explicit, confirmed RSVP. Keep older invite
-- requests in their original response category; only new submissions use RSVP.
UPDATE deals
SET title = 'Grand Opening RSVP',
    description = 'Batters & Brunch is opening its second location, and we’d love to celebrate with you. Sign in or create a TeachersVIP account, verify your educator eligibility, then confirm your RSVP. The event date and location will be shared once finalized.',
    restrictions = 'For verified educators. Creating an account or waiting for educator review does not reserve a place. You are added to the RSVP list only after confirming your RSVP.',
    cta_type = 'rsvp'
WHERE id = 'batters-brunch-grand-opening';
