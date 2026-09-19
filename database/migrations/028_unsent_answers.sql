-- What a guest answered before leaving used to exist only in the browser of that guest.
-- The evaluation could say at which step people stopped, never what they had already
-- said by then. The visit now carries the answers given up to that point.
-- Contact details stay out of it on purpose: a phone number or an address belongs to
-- the guest until they send the form. See privacyService.js, which says so on the page.
ALTER TABLE guest_sessions
  ADD COLUMN IF NOT EXISTS draft JSONB;
