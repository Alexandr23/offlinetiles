import type { CSSProperties, ReactNode } from 'react';
import styled, { css, keyframes } from 'styled-components';
import { landingTokens as t } from './landing.tokens';
import { coverTiles, gridPath, polygonPath, type Point } from './tile-geometry';

/**
 * One small looping animation per step of "How it works". They are decoration for the step text
 * beside them, so they are hidden from assistive tech, and every part's resting style is the
 * finished picture: that is what shows when animation is switched off.
 */

const WIDTH = 200;
const HEIGHT = 120;
const TILE = 20;
const COLS = WIDTH / TILE;
const LOOP = '6s';
/** Each scene starts a little after the one before it, so the row plays left to right. */
const STAGGER_S = 0.7;

type Frames = ReturnType<typeof keyframes>;
const play = (frames: Frames) => css`
  animation: ${frames} ${LOOP} linear infinite both;
`;
const round = (n: number) => Math.round(n * 100) / 100;

const Art = styled.svg<{ $play: boolean }>`
  display: block;
  width: 100%;
  height: auto;
  /* A little taller than the drawing, so the text can start over its lower edge. */
  aspect-ratio: 200 / 140;
  border: 0;
  background: ${t.bgElevated};
  /* The bottom of the picture fades out into the card. */
  -webkit-mask-image: linear-gradient(to bottom, #000 62%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 62%, transparent 100%);
  /* Doubled selector: these must outrank each part's own animation shorthand. */
  && * {
    animation-delay: var(--art-delay);
    animation-play-state: ${({ $play }) => ($play ? 'running' : 'paused')};
  }
  @media (prefers-reduced-motion: reduce) {
    && * {
      animation: none;
    }
  }
`;

/** A scene fades in empty, plays, holds its finished picture and fades out. */
const Scene = styled.g`
  ${play(keyframes`
    0% { opacity: 0; }
    4%, 92% { opacity: 1; }
    100% { opacity: 0; }
  `)}
`;

const Grid = styled.path`
  fill: none;
  stroke: ${t.line};
`;

const Selection = styled.path`
  fill: none;
  stroke: ${t.cut};
  stroke-width: 2;
`;

/* ── 01 Select area: a cursor draws the polygon, vertex by vertex ─────────────────────────── */

const AREA: Point[] = [
  [52, 30],
  [124, 20],
  [162, 56],
  [140, 98],
  [70, 90],
];
const AREA_PATH = polygonPath(AREA);
/** Where the cursor waits once the shape is closed. */
const CURSOR_REST: Point = [172, 92];
/** The outline is drawn between these two moments, in percent of the loop. */
const DRAW_FROM = 8;
const DRAW_TO = 50;

const SIDES = AREA.map(([x, y], i) => {
  const [nextX, nextY] = AREA[(i + 1) % AREA.length]!;
  return Math.hypot(nextX - x, nextY - y);
});
const PERIMETER = SIDES.reduce((sum, side) => sum + side, 0);
/** The moment the pen reaches each vertex, ending back on the first one. */
const VERTEX_AT = SIDES.reduce(
  (moments, side) => [...moments, moments[moments.length - 1]! + ((DRAW_TO - DRAW_FROM) * side) / PERIMETER],
  [DRAW_FROM],
).map(round);

const moveTo = ([x, y]: Point) => `transform: translate(${x}px, ${y}px);`;

const Outline = styled(Selection)`
  stroke-dasharray: 100;
  ${play(keyframes`
    0%, ${DRAW_FROM}% { stroke-dashoffset: 100; }
    ${DRAW_TO}%, 100% { stroke-dashoffset: 0; }
  `)}
`;

const AreaFill = styled.path`
  fill: ${t.cut};
  fill-opacity: 0.18;
  ${play(keyframes`
    0%, ${DRAW_TO}% { opacity: 0; }
    ${DRAW_TO + 8}%, 100% { opacity: 1; }
  `)}
`;

const appearAt = (moment: number) => keyframes`
  0%, ${round(moment - 0.01)}% { opacity: 0; }
  ${moment}%, 100% { opacity: 1; }
`;
const VERTEX_FRAMES = AREA.map((_, i) => appearAt(VERTEX_AT[i]!));

const Vertex = styled.rect<{ $frames: Frames }>`
  fill: ${t.bg};
  stroke: ${t.cut};
  stroke-width: 1.5;
  ${({ $frames }) => play($frames)}
`;

const Cursor = styled.path`
  fill: #fff;
  stroke: ${t.bg};
  stroke-width: 1;
  ${moveTo(CURSOR_REST)}
  ${play(keyframes`
    0% { ${moveTo(AREA[0]!)} }
    ${VERTEX_AT.map((moment, i) => `${moment}% { ${moveTo(AREA[i % AREA.length]!)} }`).join('\n')}
    ${DRAW_TO + 10}%, 100% { ${moveTo(CURSOR_REST)} }
  `)}
`;

function SelectArt() {
  return (
    <Scene>
      <Grid d={gridPath(COLS, HEIGHT / TILE, TILE)} />
      <path
        d="M0 78L60 62L120 74L200 40M84 0L96 66L88 120"
        fill="none"
        stroke={t.accent}
        strokeWidth="1.5"
        opacity="0.22"
      />
      <AreaFill d={AREA_PATH} />
      <Outline d={AREA_PATH} pathLength={100} />
      {AREA.map(([x, y], i) => (
        <Vertex key={`${x}-${y}`} x={x - 3} y={y - 3} width="6" height="6" $frames={VERTEX_FRAMES[i]!} />
      ))}
      <Cursor d="M0 0V13L3.6 9.8L6 15.2L8.2 14.2L5.8 8.9H10.4Z" />
    </Scene>
  );
}

/* ── 02 Style: the same map, repainted preset by preset ───────────────────────────────────── */

const PALETTES = [
  { land: t.mapLand, water: t.mapWater, park: '#123A33', road: t.accent, lane: '#2B4A66' },
  { land: '#EEF1F4', water: '#A9D4F2', park: '#C4E3C0', road: '#8A97A6', lane: '#C5CDD6' },
  { land: '#F3EFE6', water: '#9CC7EA', park: '#BFE0B5', road: '#F6C453', lane: '#FFFFFF' },
] as const;
type Layer = keyof (typeof PALETTES)[number];

const SWATCH = 14;
const SWATCH_STEP = 22;
const SWATCH_X = 124;
const SWATCH_Y = 92;

/** Paints a map layer with each palette in turn; rests on the first. */
const paint = (property: 'fill' | 'stroke', layer: Layer) => {
  const [first, second, third] = PALETTES.map((palette) => palette[layer]);
  return css`
    ${property}: ${first};
    ${play(keyframes`
      0%, 28% { ${property}: ${first}; }
      33%, 61% { ${property}: ${second}; }
      66%, 94% { ${property}: ${third}; }
      100% { ${property}: ${first}; }
    `)}
  `;
};

const Land = styled.rect`
  ${paint('fill', 'land')}
`;
const Water = styled.path`
  ${paint('fill', 'water')}
`;
const Park = styled.path`
  ${paint('fill', 'park')}
`;
const Road = styled.path`
  fill: none;
  stroke-width: 3;
  ${paint('stroke', 'road')}
`;
const Lane = styled.path`
  fill: none;
  stroke-width: 1.5;
  ${paint('stroke', 'lane')}
`;

/** The frame round the active swatch, hopping in step with the repaint. */
const Picked = styled.rect`
  fill: none;
  stroke: #fff;
  stroke-width: 1.5;
  ${play(keyframes`
    0%, 28% { transform: translateX(0); }
    33%, 61% { transform: translateX(${SWATCH_STEP}px); }
    66%, 94% { transform: translateX(${SWATCH_STEP * 2}px); }
    100% { transform: translateX(0); }
  `)}
`;

function StyleArt() {
  return (
    <>
      <Land width={WIDTH} height={HEIGHT} />
      <Water d="M118 0H200V58L170 74L138 44Z" />
      <Park d="M18 62H64V102H18Z" />
      <Lane d="M0 104H84M42 0V46M100 48V120M138 44L200 96" />
      <Road d="M0 42L72 50L138 44M72 50L84 120" />
      <rect
        x={SWATCH_X - 6}
        y={SWATCH_Y - 5}
        width={SWATCH_STEP * 2 + SWATCH + 12}
        height={SWATCH + 10}
        fill={t.bg}
        stroke={t.lineStrong}
      />
      {PALETTES.map((palette, i) => {
        const x = SWATCH_X + i * SWATCH_STEP;
        return (
          <g key={palette.land}>
            <rect x={x} y={SWATCH_Y} width={SWATCH} height={SWATCH} fill={palette.land} />
            <path d={`M${x + SWATCH} ${SWATCH_Y}v${SWATCH}h${-SWATCH}z`} fill={palette.water} />
          </g>
        );
      })}
      <Picked x={SWATCH_X - 2} y={SWATCH_Y - 2} width={SWATCH + 4} height={SWATCH + 4} />
    </>
  );
}

/* ── 03 Generate: tiles under the selection fill in column by column ──────────────────────── */

const JOB: Point[] = [
  [50, 18],
  [124, 10],
  [166, 44],
  [148, 88],
  [76, 94],
  [32, 60],
];
/** The bottom tile row is left free for the progress bar. */
const JOB_ROWS = HEIGHT / TILE - 1;
const JOB_HEIGHT = JOB_ROWS * TILE;
const JOB_TILES = coverTiles(JOB, COLS, JOB_ROWS, TILE);
const SWEEP_FROM = 8;
const SWEEP_TO = 56;
/** One jump per tile column, so cover, scan line and progress bar move together. */
const BY_COLUMN = `animation-timing-function: steps(${COLS}, end);`;

const Tile = styled.rect<{ $edge?: boolean }>`
  fill: ${t.accent};
  fill-opacity: ${({ $edge }) => ($edge ? 0.12 : 0.32)};
  stroke: ${t.accent};
  stroke-opacity: 0.5;
`;

/** Hides the tiles that are not generated yet; shrinks away to the right. */
const Cover = styled.rect`
  fill: ${t.bgElevated};
  transform: scaleX(0);
  transform-box: fill-box;
  transform-origin: right center;
  ${play(keyframes`
    0%, ${SWEEP_FROM}% { transform: scaleX(1); ${BY_COLUMN} }
    ${SWEEP_TO}%, 100% { transform: scaleX(0); }
  `)}
`;

const ScanLine = styled.path`
  stroke: #fff;
  stroke-width: 1.5;
  opacity: 0;
  ${play(keyframes`
    0%, ${SWEEP_FROM}% { transform: translateX(0); opacity: 1; ${BY_COLUMN} }
    ${SWEEP_TO}% { transform: translateX(${WIDTH}px); opacity: 1; }
    ${SWEEP_TO + 0.01}%, 100% { transform: translateX(${WIDTH}px); opacity: 0; }
  `)}
`;

const Progress = styled.rect`
  fill: ${t.accent};
  transform-box: fill-box;
  transform-origin: left center;
  ${play(keyframes`
    0%, ${SWEEP_FROM}% { transform: scaleX(0); ${BY_COLUMN} }
    ${SWEEP_TO}%, 100% { transform: scaleX(1); }
  `)}
`;

function GenerateArt() {
  const bar = { x: TILE, y: JOB_HEIGHT + 8, width: WIDTH - 2 * TILE, height: 4 };
  return (
    <Scene>
      {JOB_TILES.inside.map(([x, y]) => (
        <Tile key={`${x}-${y}`} x={x} y={y} width={TILE} height={TILE} />
      ))}
      {JOB_TILES.edge.map(([x, y]) => (
        <Tile key={`${x}-${y}`} x={x} y={y} width={TILE} height={TILE} $edge />
      ))}
      <Cover width={WIDTH} height={JOB_HEIGHT} />
      <Grid d={gridPath(COLS, JOB_ROWS, TILE)} />
      <Selection d={polygonPath(JOB)} />
      <ScanLine d={`M0 0V${JOB_HEIGHT}`} />
      <rect {...bar} fill={t.line} />
      <Progress {...bar} />
    </Scene>
  );
}

/* ── 04 Use offline: the file lands on a device, the network goes, the map stays ──────────── */

const FILE_PATH = 'M24 36H46L58 48V84H24Z';
const FOLD_PATH = 'M46 36V48H58';
const FILE_CENTER_X = 41;
const PHONE = { x: 84, y: 12, width: 54, height: 96 };
const SCREEN = { x: PHONE.x + 4, y: PHONE.y + 8, width: PHONE.width - 8, height: PHONE.height - 20 };
const LAND_AT = 30;
const CUT_AT = 50;

/** A copy of the file slides from its icon into the device. */
const Copy = styled.g`
  opacity: 0;
  ${play(keyframes`
    0%, 8% { transform: translateX(0); opacity: 1; }
    ${LAND_AT - 4}% { opacity: 1; }
    ${LAND_AT}%, 100% { transform: translateX(${PHONE.x + PHONE.width / 2 - FILE_CENTER_X}px); opacity: 0; }
  `)}
`;

const ScreenMap = styled.g`
  ${play(keyframes`
    0%, ${LAND_AT}% { opacity: 0; }
    ${LAND_AT + 8}%, 100% { opacity: 1; }
  `)}
`;

const Signal = styled.g`
  opacity: 0.35;
  ${play(keyframes`
    0%, ${CUT_AT}% { opacity: 1; }
    ${CUT_AT + 8}%, 100% { opacity: 0.35; }
  `)}
`;

const Slash = styled.path`
  fill: none;
  stroke: ${t.cut};
  stroke-width: 3;
  stroke-dasharray: 100;
  ${play(keyframes`
    0%, ${CUT_AT}% { stroke-dashoffset: 100; }
    ${CUT_AT + 8}%, 100% { stroke-dashoffset: 0; }
  `)}
`;

const FileLabel = styled.text`
  fill: ${t.textMuted};
  font: 500 7px ${t.fontMono};
  letter-spacing: 0.08em;
  text-anchor: middle;
`;

function FileIcon() {
  return (
    <g fill={t.bg} stroke={t.accent} strokeWidth="1.5">
      <path d={FILE_PATH} />
      <path d={FOLD_PATH} />
    </g>
  );
}

function OfflineArt() {
  return (
    <Scene>
      <FileIcon />
      <FileLabel x={FILE_CENTER_X} y="97">
        MBTILES
      </FileLabel>
      <path d={`M64 60H${PHONE.x - 6}`} fill="none" stroke={t.lineStrong} strokeDasharray="2 3" />

      <rect {...PHONE} fill={t.bg} stroke={t.lineStrong} strokeWidth="1.5" />
      <path
        d={`M${PHONE.x + 22} ${PHONE.y + 4}h10M${PHONE.x + 20} ${PHONE.y + PHONE.height - 6}h14`}
        stroke={t.lineStrong}
        strokeWidth="1.5"
      />
      {/* A nested svg clips the map to the screen. */}
      <svg {...SCREEN} viewBox={`0 0 ${SCREEN.width} ${SCREEN.height}`}>
        <ScreenMap>
          <rect width={SCREEN.width} height={SCREEN.height} fill={t.mapLand} />
          <path d="M26 0H46V28L34 34Z" fill={t.mapWater} />
          <path d="M0 46L20 40L46 50M20 40L26 76" fill="none" stroke={t.accent} strokeWidth="2" opacity="0.7" />
          <path d="M8 14L28 9L38 30L26 58L9 46Z" fill={t.cut} fillOpacity="0.18" stroke={t.cut} strokeWidth="1.5" />
        </ScreenMap>
      </svg>
      <Copy>
        <FileIcon />
      </Copy>

      <Signal fill="none" stroke={t.textSecondary} strokeWidth="2.5">
        <path d="M149 59A24 24 0 0 1 183 59M154.7 64.7A16 16 0 0 1 177.3 64.7M160.3 70.3A8 8 0 0 1 171.7 70.3" />
        <rect x="164" y="74" width="4" height="4" fill={t.textSecondary} stroke="none" />
      </Signal>
      <Slash d="M148 84L184 50" pathLength={100} />
    </Scene>
  );
}

const SCENES: readonly (() => ReactNode)[] = [SelectArt, StyleArt, GenerateArt, OfflineArt];

/** The illustration for step `step` (zero-based), or nothing if the copy has more steps than scenes. */
export function StepArt({ step, playing }: { step: number; playing: boolean }) {
  const SceneFor = SCENES[step];
  if (!SceneFor) return null;
  return (
    <Art
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      aria-hidden
      focusable="false"
      $play={playing}
      style={{ '--art-delay': `${step * STAGGER_S}s` } as CSSProperties}
    >
      <SceneFor />
    </Art>
  );
}
