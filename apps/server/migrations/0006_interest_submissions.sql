-- Landing "Contact us" form: one row per submission, read from the admin dashboard.

CREATE TABLE interest_submissions (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    intended_use TEXT NOT NULL,
    features TEXT[] NOT NULL DEFAULT '{}',
    willingness TEXT,
    feedback TEXT,
    marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
    source TEXT,
    utm_source TEXT,
    utm_campaign TEXT,
    generation_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX interest_submissions_created_at_idx ON interest_submissions (created_at DESC);
CREATE INDEX interest_submissions_email_idx ON interest_submissions (email);
