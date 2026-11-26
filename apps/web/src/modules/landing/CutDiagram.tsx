import { useId } from 'react';
import styled, { keyframes } from 'styled-components';
import { CUT } from './landing.content';
import { landingTokens as t } from './landing.tokens';
import { coverTiles, gridPath, polygonPath, type Point } from './tile-geometry';

const TILE = 48;
const COLS = 10;
const ROWS = 8;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;

/** The selection, in diagram pixels. */
const POLYGON: Point[] = [
  [118, 58],
  [302, 34],
  [424, 130],
  [398, 300],
  [236, 346],
  [70, 236],
];
const POLYGON_PATH = polygonPath(POLYGON);
/** Tiles the polygon edge passes through: in the file, but only partly inside the selection. */
const EDGE_TILES = coverTiles(POLYGON, COLS, ROWS, TILE).edge;
const GRID_PATH = gridPath(COLS, ROWS, TILE);

const blade = keyframes`
  to { stroke-dashoffset: -100; }
`;

const Svg = styled.svg`
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
`;

/** A bright spark running round the selection: the cut being made. */
const Blade = styled.path`
  fill: none;
  stroke: #fff;
  stroke-width: 2.5;
  stroke-dasharray: 7 93;
  animation: ${blade} 7s linear infinite;
`;

/**
 * Explains the cut: untouched tiles are left out of the file, tiles the selection edge crosses
 * are kept but transparent outside the line (checkerboard), and the map survives only inside.
 */
export function CutDiagram() {
  const id = useId();
  const clip = `${id}-clip`;
  const checker = `${id}-checker`;

  return (
    <Svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={CUT.diagramAlt}>
      <defs>
        <clipPath id={clip}>
          <path d={POLYGON_PATH} />
        </clipPath>
        <pattern id={checker} width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M0 0h6v6H0zM6 6h6v6H6z" fill={t.lineStrong} opacity="0.5" />
        </pattern>
      </defs>

      <path d={GRID_PATH} fill="none" stroke={t.line} strokeWidth="1" />

      {EDGE_TILES.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width={TILE}
          height={TILE}
          fill={`url(#${checker})`}
          stroke={t.lineStrong}
        />
      ))}

      <g clipPath={`url(#${clip})`}>
        <rect width={WIDTH} height={HEIGHT} fill={t.mapLand} />
        <path d="M318 252L452 196L476 340L296 384Z" fill={t.mapWater} />
        <g fill="none" stroke={t.accent}>
          <path d="M92 118L404 88M112 304L424 246M334 36L352 344M138 56L162 334" strokeWidth="1" opacity="0.3" />
          <path d="M36 252L182 190L302 212L462 118M204 16L232 182L208 380" strokeWidth="2.5" opacity="0.7" />
        </g>
        <path d={GRID_PATH} fill="none" stroke={t.bg} strokeWidth="1" opacity="0.7" />
      </g>

      <path d={POLYGON_PATH} fill="none" stroke={t.cut} strokeWidth="2" strokeLinejoin="miter" />
      <Blade d={POLYGON_PATH} pathLength={100} />
      {POLYGON.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 4} y={y - 4} width="8" height="8" fill={t.bg} stroke={t.cut} strokeWidth="2" />
      ))}
    </Svg>
  );
}
