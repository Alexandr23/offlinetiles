-- The form only asks for an email when the visitor agrees to receive updates.

ALTER TABLE interest_submissions ALTER COLUMN email DROP NOT NULL;
