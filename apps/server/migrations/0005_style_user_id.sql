-- Own map styles per user. Orphan legacy rows (no owner) stay inaccessible via API.

ALTER TABLE map_styles
    ADD COLUMN user_id UUID REFERENCES users (id) ON DELETE CASCADE;

CREATE INDEX map_styles_user_id_idx ON map_styles (user_id);
CREATE INDEX map_styles_user_updated_idx ON map_styles (user_id, updated_at DESC);
