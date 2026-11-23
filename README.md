# Map Exporter

Local OpenStreetMap tile exporter. Initialize a master dataset once (a region or the whole planet),
then draw an area in the browser, pick a style and zoom range, and generate a vector or raster
**MBTiles** file — entirely offline, on your own machine.

```
OSM extract ──Planetiler──▶ data/master/master.pmtiles
                                   │
   browser (React + MapLibre) ──▶ API (Fastify + PostgreSQL) ──▶ worker ──▶ tile-generator (Rust) ──▶ map.mbtiles
```

## Quick start

Requirements: Node 22+, pnpm (via corepack), Rust 1.80+, Docker (PostgreSQL + Planetiler).

```sh
cp .env.example .env
pnpm install
pnpm build:rust                     # builds rust/target/release/tile-generator
docker compose up -d postgres
pnpm db:migrate
pnpm init-map --region monaco       # any Geofabrik region, e.g. --region andorra, --region us/colorado
pnpm dev                            # web on http://localhost:5173, API + worker on :3000
```

`init-map` downloads the extract into `data/source/`, downloads glyph fonts into `data/assets/fonts/`,
runs Planetiler (OpenMapTiles schema, z0–14) through Docker and atomically promotes the result to
`data/master/master.pmtiles` with a `dataset.json` manifest. Re-running is idempotent; use `--force`
to rebuild. A local `planetiler.jar` can be used instead of Docker via `PLANETILER_JAR` (Java 21+).

Other sources:

```sh
pnpm init-map --osm-file ./data/source/custom.osm.pbf
pnpm init-map --planet --memory 48g     # ~80 GB download, 100+ GB disk, many hours
```

## What you get

- **Map preview** of the master dataset with five built-in styles (Light, Dark, Streets, Minimal,
  Outdoor) and a live style editor (colors, road widths, label sizes, layer visibility). Custom
  styles can be saved and reused.
- **Area selection** by rectangle or polygon, zoom range, vector or raster output.
- **Estimates** before generating: tile count (exact, from the same algorithm the generator uses),
  size, duration and queue wait.
- **One global FIFO queue** processing one job at a time, with live progress over SSE, cancellation,
  retry, history and downloads.
- **Artifacts**: `map.mbtiles` plus `style.json` (the exact style snapshot used) and `manifest.json`.
  Vector exports contain gzip-compressed MVT tiles; raster exports contain PNG tiles rendered by
  MapLibre Native.

## Repository layout

| Path                            | Purpose                                                             |
| ------------------------------- | ------------------------------------------------------------------- |
| `apps/web`                      | React 19 + Vite + MapLibre GL + Terra Draw + Zustand + styled-components |
| `apps/server`                   | Fastify API, PostgreSQL (plain SQL migrations), queue worker, SSE  |
| `apps/renderer`                 | MapLibre Native sidecar used for raster tiles (JSON-lines protocol) |
| `packages/contracts`            | Shared zod schemas / TypeScript types between web and server        |
| `rust/crates/tile-selector`     | Web Mercator math, quadtree polygon → tile selection                |
| `rust/crates/pmtiles-source`    | mmap PMTiles reader (+ fixture writer for tests)                    |
| `rust/crates/mbtiles-writer`    | Single-writer MBTiles output, batched transactions, atomic rename   |
| `rust/crates/generator-core`    | Request protocol, cancellation, progress, producer → writer pipeline |
| `rust/crates/vector-generator`  | Copies MVT tiles PMTiles → MBTiles                                  |
| `rust/crates/raster-generator`  | Drives renderer sidecars, encodes PNG                               |
| `rust/crates/generator-cli`     | `tile-generator generate|estimate|fixture|benchmark`                |
| `scripts/`                      | `init-map`, `download-osm`, `build-master`                          |
| `docker/`                       | Dockerfiles + nginx config for the full compose stack               |

## Development

```sh
pnpm dev            # web + api + worker (hot reload)
pnpm dev:web        # only the web app
pnpm dev:server     # api + worker in one process
pnpm dev:worker     # worker only (run api separately with pnpm --filter @map-exporter/server dev:api)

pnpm typecheck      # all TypeScript packages + scripts
pnpm test           # vitest (contracts, server, web), node:test (renderer, scripts)
pnpm test:rust      # cargo test for every crate, incl. CLI end-to-end tests
pnpm lint:rust      # clippy with -D warnings
pnpm fmt            # prettier + cargo fmt
```

The Rust generator is a standalone CLI. The worker spawns it with an argument array
(`tile-generator generate <request.json>`) and parses JSON lines from stdout:

```
{"type":"started","totalTiles":1234}
{"type":"progress","completed":500,"total":1234,"bytes":5120000,"elapsedMs":800}
{"type":"packaging"}
{"type":"completed","tiles":1234,"bytes":12800000,"elapsedMs":2100}
```

`tile-generator benchmark --max-zoom 10` builds a synthetic PMTiles archive and reports vector
throughput; `tile-generator fixture out.pmtiles` writes one for tests.

## Configuration

Everything is read from `.env` (see `.env.example`). The important ones:

| Variable                  | Default                                  | Meaning                                    |
| ------------------------- | ---------------------------------------- | ------------------------------------------ |
| `DATABASE_URL`            | `postgres://mapexporter:…@localhost:5432/mapexporter` | PostgreSQL connection          |
| `DATA_DIR`                | `./data`                                 | Root for source, master, exports, assets   |
| `GENERATOR_BINARY`        | `./rust/target/release/tile-generator`   | Rust CLI used by the worker                |
| `GENERATOR_THREADS`       | `0` (auto)                               | Reader/renderer worker count               |
| `RASTER_RENDERER_COMMAND` | `node ./apps/renderer/src/index.js`      | Sidecar command (argv, no shell)           |
| `MAX_EXPORT_TILES`        | `5000000`                                | Hard limit per job                         |
| `PLANETILER_IMAGE` / `PLANETILER_JAR` / `PLANETILER_MEMORY` | docker image, none, `2g` | How `init-map` runs Planetiler |

## Docker Compose

`docker compose up -d postgres` is all the quick start needs. The full stack (API, worker, web behind
nginx) is behind the `full` profile:

```sh
docker compose --profile full up --build
```

The `server`/`worker` images bundle the Rust CLI and the renderer; `data/` is bind-mounted at `/data`.
Run `pnpm init-map` on the host first so the dataset exists.

## Design notes

- **PMTiles is the master format**, read with range requests (Node) and mmap (Rust); never loaded in memory.
- **Tile selection is shared** between estimates and generation: one quadtree walk, contained
  subtrees counted arithmetically, so counts can never disagree.
- **XYZ everywhere, TMS only in the MBTiles writer** (`rust/crates/mbtiles-writer/src/tms.rs`).
- **One SQLite writer** per job, batched transactions, `.tmp` + atomic rename.
- **Cancellation** is cooperative: the worker flags the row, sends SIGTERM, the generator stops its
  pipeline and removes temporary output; stale `GENERATING` rows are failed on worker restart.
- **No external runtime dependencies**: fonts, tiles and styles are served from `data/`.
- **Raster rendering** runs in `apps/renderer`, a MapLibre Native sidecar spawned per generator
  thread. `@maplibre/maplibre-gl-native` is pinned to `5.4.1` (the last OpenGL build): the 6.x
  Metal builds render blank frames on macOS, while 5.4.1 ships prebuilt binaries for Linux and
  macOS (x64/arm64). On Linux it needs a display, which `docker/entrypoint.sh` provides via `xvfb-run`.
