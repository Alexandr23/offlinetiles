CREATE TABLE generations (
    id UUID PRIMARY KEY,

    name TEXT NOT NULL,

    -- Immutable request snapshot
    polygon JSONB NOT NULL,
    min_zoom INTEGER NOT NULL CHECK (min_zoom >= 0 AND min_zoom <= 22),
    max_zoom INTEGER NOT NULL CHECK (max_zoom >= 0 AND max_zoom <= 22 AND max_zoom >= min_zoom),

    content_type TEXT NOT NULL CHECK (content_type IN ('vector', 'raster')),
    container_type TEXT NOT NULL CHECK (container_type IN ('mbtiles')),
    raster_options JSONB,

    style_id UUID,
    style_name TEXT,
    style_snapshot JSONB,

    status TEXT NOT NULL CHECK (status IN ('QUEUED', 'GENERATING', 'PACKAGING', 'COMPLETED', 'FAILED', 'CANCELLED')),

    tile_count BIGINT,
    completed_tiles BIGINT NOT NULL DEFAULT 0,

    estimated_size BIGINT,
    actual_size BIGINT,

    estimated_duration_ms BIGINT,
    actual_duration_ms BIGINT,

    output_path TEXT,

    dataset_version TEXT,

    error_code TEXT,
    error TEXT,

    cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX generations_status_idx ON generations (status);
CREATE INDEX generations_created_at_idx ON generations (created_at);
CREATE INDEX generations_completed_at_idx ON generations (completed_at DESC);
CREATE INDEX generations_queue_idx ON generations (created_at) WHERE status = 'QUEUED';
