# Local Map Tile Exporter — Product & Technical Requirements

Build a fully local application for preparing reusable map exports from OpenStreetMap data.

A user can initialize a local dataset (region, planet, or existing `.osm.pbf`), browse it offline, draw an area, pick zoom / content / style, estimate, queue a job, and download vector or raster **MBTiles**. v1 has no auth, one global FIFO queue, one active job, local filesystem storage, PostgreSQL persistence, and MBTiles as the only export container. Additional containers (PMTiles, directory) must be addable later without redesigning generation.

## Architecture

```
OSM PBF ──Planetiler──▶ master.pmtiles
                              │
React (MapLibre + style editor) ──REST/SSE──▶ Node (API / DB / queue)
                                                    │
                                              Rust tile-generator
                                                    │
                                         vector MVT / raster PNG
                                                    │
                                              MBTiles writer
```

Strict boundaries:

| Layer | Owns | Must not |
| --- | --- | --- |
| React | UI, map, drawing, style editing, Zustand, REST, SSE | Persist jobs / styles / artifacts |
| Node | HTTP, PostgreSQL, queue, history, SSE, process mgmt, estimates | Heavy tile processing |
| Rust | PMTiles reads, XYZ selection, vector copy, raster orchestration, MBTiles, progress, cancel | Queue / DB logic |
| Planetiler | Initialization only (`OSM PBF → master.pmtiles`) | Run on user exports |

## Stack

- **Web:** React, TypeScript, Vite, styled-components, Zustand, MapLibre GL JS, Terra Draw. No Redux / MobX / Tailwind / MUI / Chakra / Next.js.
- **Server:** Node, TypeScript, Fastify, PostgreSQL (`postgres` + SQL migrations), SSE, zod.
- **Generator:** Rust, Tokio, Rayon, rusqlite, PMTiles v3, geo/geojson. Protocol is versioned JSON (`protocolVersion: 1`), not shared TS source.
- **Master dataset:** OpenMapTiles-compatible vector schema in `data/master/master.pmtiles`.

Monorepo: pnpm workspaces + Cargo workspace. Layout:

```
apps/web  apps/server  apps/renderer  packages/contracts
rust/crates/{generator-cli,generator-core,tile-selector,pmtiles-source,vector-generator,raster-generator,mbtiles-writer}
scripts/  data/{source,master,exports}  docker/  PRD.md
```

## Initialization

Not part of the generation queue. CLI:

```sh
pnpm init-map --region monaco
pnpm init-map --region germany --force
pnpm init-map --planet
pnpm init-map --osm-file /data/custom.osm.pbf
```

Workflow: validate → directories → resolve/download PBF → Planetiler → `master.pmtiles.tmp` → validate → atomic rename → `dataset.json`. Never overwrite the live master in place. Runtime only sees `data/master/master.pmtiles`.

`GET /api/dataset` reports `{ ready, source, minZoom, maxZoom, bounds }` or `{ ready: false }`. Frontend shows an initialization-required screen instead of crashing.

Preview uses the master PMTiles file directly (range requests). Do not copy master data into MBTiles for the map.

## Frontend

Feature modules (`map`, `drawing`, `style-editor`, `export`, `queue`, `history`, `dataset`) plus `shared/`. Separate Zustand stores: `map`, `drawing`, `style`, `export`, `queue`, `ui`. Zustand is authoritative only for temporary UI state. Jobs, queue, history, saved styles, artifacts, and dataset state are owned by the backend.

Drawing: rectangle, polygon, clear. Canonical selection is GeoJSON `Polygon` / `MultiPolygon`.

Export config:

```json
{ "content": "vector" | "raster", "container": "mbtiles" }
```

MBTiles is a container, not tile content. If another job is running the CTA is **Add to Queue**, not a disabled Generate.

Styles are independent of areas. Built-in presets (immutable): Light, Dark, Streets, Minimal, Outdoor. Editing a preset creates a working copy. Persist full MapLibre Style Spec v8 JSON. Saved ops: create, save, rename, duplicate, delete, apply. Jobs store `style_id`, `style_name`, and a full `style_snapshot` so later edits do not change old exports.

v1 style editor: background, water, land, parks, buildings, roads (motorway/primary/secondary + width scale), boundaries, labels (countries/cities/roads/POIs + size scale + visibility). Live MapLibre preview.

## Backend

SQL tables: `map_styles`, `generations` (indexes on `status`, `created_at`, `completed_at`). Status enum only: `QUEUED`, `GENERATING`, `PACKAGING`, `COMPLETED`, `FAILED`, `CANCELLED`. Central transition validator; no arbitrary jumps.

Queue is one global FIFO (`ORDER BY created_at ASC`). Position is computed, never stored. Dequeue:

```sql
SELECT * FROM generations WHERE status = 'QUEUED' ORDER BY created_at
FOR UPDATE SKIP LOCKED LIMIT 1;
```

then `GENERATING` in the same transaction. MVP concurrency = 1. Crash recovery: stale `GENERATING` / `PACKAGING` → `FAILED` / `WORKER_INTERRUPTED`.

REST:

```
GET  /api/dataset
GET|POST /api/styles   GET|PUT|DELETE /api/styles/:id   POST /api/styles/:id/duplicate
POST /api/generations/estimate   POST|GET /api/generations
GET|DELETE /api/generations/:id   POST /api/generations/:id/retry
GET  /api/generations/:id/download
GET  /api/events
```

SSE (not WebSocket). Events: `generation.{created,started,progress,packaging,completed,failed,cancelled,deleted}`, `queue.changed`, `style.{created,updated,deleted}`. Throttle progress to 500–1000 ms. On reconnect, refetch REST; do not assume every event arrived.

Errors:

```json
{ "error": { "code": "INVALID_ZOOM_RANGE", "message": "minZoom must be <= maxZoom" } }
```

Validate GeoJSON, zooms, styles, UUIDs, enums, names, request sizes. Spawn the generator with an argument array, never a shell string. Artifact paths are server-derived from the job UUID. Downloads only for `COMPLETED` jobs with an artifact.

Estimates use the same tile-selection algorithm as generation (polygon intersection, not bbox-only). Vector size from source tile bytes + SQLite overhead; raster from historical averages with configurable fallbacks. Queue wait = remaining current job + queued jobs ahead.

## Rust generator

Standalone CLI: `tile-generator generate <request.json>`. Stdout = JSON lines only; logs on stderr.

```
{"type":"started","totalTiles":18342}
{"type":"progress","completed":1000,"total":18342}
{"type":"packaging"}
{"type":"completed","tiles":18342,"bytes":843829102}
```

Fatal: `{"type":"failed","code":"…","message":"…"}` and non-zero exit. Cancellation: Node sends SIGTERM; generator stops work, rolls back, deletes incomplete output. Write `map.mbtiles.tmp`, atomic rename on success.

Tile selection: Web Mercator range → candidate XYZ → polygon intersection. Do not clip MVT geometry in MVP. Internal coords are XYZ; TMS Y conversion lives in one module: `tmsY = (2^z - 1) - xyzY`.

Vector: copy compressed MVT bytes from PMTiles. Do not decode/rebuild or rerun Planetiler. Raster: MapLibre-compatible renderer behind `RasterRenderer`; MVP PNG 256×256 of the exact XYZ viewport. Parallel producers → bounded channel → **one** SQLite writer, batched transactions (1000–10000 tiles). `GENERATOR_THREADS=0` means `available_parallelism - 1` (min 1).

`TileWriter` abstraction (`MbtilesWriter` now; PMTiles / directory later). MBTiles 1.3: `metadata` + `tiles` + unique `(zoom_level, tile_column, tile_row)`. Vector `format=pbf`, raster `format=png`.

Artifacts: `data/exports/<job-id>/{map.mbtiles,style.json,manifest.json}`.

## UI / UX

Dark-first, custom design system (tokens + styled-components). No third-party component kit. Desktop-first (1440px+, usable at 1024px+). Map is the primary surface; configuration lives in side panels.

Required shared controls: Button, IconButton, Input, NumberInput, Select, Slider, RangeSlider, Switch, Tabs, Tooltip, Modal, Panel, ProgressBar, StatusIndicator, ColorPicker, PropertyRow.

Statuses use technical language with a dot **and** a label (`● GENERATING`). Motion 120–250 ms, `prefers-reduced-motion` respected, GPU-friendly (`transform` / `opacity`). Narrow Zustand selectors so SSE progress does not rerender the whole app.

## Operations

`.env.example` documents `PORT`, `DATABASE_URL`, `DATA_DIR`, `MASTER_PMTILES`, `EXPORTS_DIR`, `GENERATOR_BINARY`, `GENERATOR_THREADS` (`0` = auto), plus host/log/public URL/throttle knobs.

Compose: `postgres` always; `server` + `worker` + `web` on the `full` profile. Shared `/data`. Commands: `pnpm dev`, `pnpm dev:web`, `pnpm dev:server`, `pnpm db:migrate`, `pnpm init-map`, `pnpm server:api`, `pnpm server:worker`, `pnpm test`, `cargo test` / `clippy` / `fmt`.

After init, runtime is offline: tiles, fonts/glyphs, and sprites are local. No Mapbox-hosted assets.

## Testing

- Frontend: stores, style transforms, export validation, formatters.
- Backend: validation, style CRUD, queue/dequeue, transitions, artifacts, protocol parser, SSE mapping.
- Rust: XYZ, TMS round-trip, polygon intersection, PMTiles, MBTiles batching, cancel, progress.
- E2E fixture: tiny PMTiles → vector MBTiles (and raster PNG dimensions) without downloading Planet.

## Out of scope (v1)

Auth, users, payments, S3/MinIO, Redis/Kafka/RabbitMQ, Kubernetes, OSM replication, geometry clipping, mobile, satellite/terrain/3D, commercial APIs.

## Implementation rules

Do not replace the specified stack. Do not add speculative infrastructure. Prefer explicit code. Do not leave TODO placeholders in a completed phase. Temporary files use `.tmp` + atomic rename. Every job is reproducible from its persisted snapshot. When ambiguous, pick the simplest design consistent with this document.
