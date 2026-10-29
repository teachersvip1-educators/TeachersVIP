-- Event details are separate from offer publication/availability dates.
-- The date/time label includes the event's local time and time zone.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS event_date_time text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS event_location text;
