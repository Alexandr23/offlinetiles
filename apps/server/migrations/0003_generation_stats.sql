-- Historical statistics used by the estimator (bytes/tile, ms/tile) grouped by
-- content type and raster options. One row per completed generation.
CREATE TABLE generation_stats (
    generation_id UUID PRIMARY KEY REFERENCES generations (id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    raster_tile_size INTEGER,
    max_zoom INTEGER NOT NULL,
    tile_count BIGINT NOT NULL,
    bytes BIGINT NOT NULL,
    duration_ms BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX generation_stats_content_idx ON generation_stats (content_type, created_at DESC);
