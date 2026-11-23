-- Auth + usage limits. Guests are first-class users without credentials.

CREATE TABLE role_limits (
    role TEXT PRIMARY KEY CHECK (role IN ('guest', 'user')),
    max_generations INTEGER NOT NULL CHECK (max_generations >= 0),
    max_tiles BIGINT NOT NULL CHECK (max_tiles >= 0),
    max_area_km2 DOUBLE PRECISION NOT NULL CHECK (max_area_km2 >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO role_limits (role, max_generations, max_tiles, max_area_km2) VALUES
    ('guest', 1, 50000, 100),
    ('user', 20, 500000, 10000);

CREATE TABLE users (
    id UUID PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('guest', 'user', 'admin')),
    login TEXT UNIQUE,
    password_hash TEXT,
    display_name TEXT,
    -- NULL = inherit role default; ignored for admin (always unlimited)
    max_generations INTEGER CHECK (max_generations IS NULL OR max_generations >= 0),
    max_tiles BIGINT CHECK (max_tiles IS NULL OR max_tiles >= 0),
    max_area_km2 DOUBLE PRECISION CHECK (max_area_km2 IS NULL OR max_area_km2 >= 0),
    generations_used INTEGER NOT NULL DEFAULT 0 CHECK (generations_used >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_credentials_check CHECK (
        (role = 'guest' AND login IS NULL AND password_hash IS NULL)
        OR (role IN ('user', 'admin') AND login IS NOT NULL AND password_hash IS NOT NULL)
    )
);

CREATE INDEX users_role_idx ON users (role);
CREATE INDEX users_last_seen_at_idx ON users (last_seen_at DESC);

CREATE TABLE sessions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

ALTER TABLE generations
    ADD COLUMN user_id UUID REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX generations_user_id_idx ON generations (user_id);
CREATE INDEX generations_user_created_idx ON generations (user_id, created_at DESC);
