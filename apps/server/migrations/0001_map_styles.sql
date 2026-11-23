CREATE TABLE map_styles (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    base_preset TEXT,
    style_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX map_styles_updated_at_idx ON map_styles (updated_at DESC);
