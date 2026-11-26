import { tokens } from '@/shared/styles/tokens';

/** Landing-only visual tokens (OfflineTiles marketing). Scoped under `.landing`. */
export const landingTokens = {
  bg: '#070B12',
  bgElevated: '#0C121C',
  glass: 'rgba(7, 11, 18, 0.72)',
  glassBorder: 'rgba(148, 176, 204, 0.16)',
  line: 'rgba(148, 176, 204, 0.16)',
  lineStrong: 'rgba(148, 176, 204, 0.34)',
  /** Same cyan as the editor accent. */
  accent: '#4FD1FF',
  accentHover: '#8BE1FF',
  accentMuted: 'rgba(79, 209, 255, 0.14)',
  onAccent: '#04080E',
  /** The editor's selection pink: on the landing it marks selections, the hero outline and the cut line. */
  cut: tokens.color.selection,
  /** Land and water of the little maps in the diagrams. */
  mapLand: '#10263D',
  mapWater: '#081424',
  text: '#F2F5F9',
  textSecondary: '#A3B3C6',
  textMuted: '#7D8EA3',
  radius: '0px',
  radiusSm: '0px',
  /** Buttons are square-ish, not pills. */
  radiusButton: '2px',
  maxWidth: '1200px',
  fontDisplay: `'Archivo', 'Arial Narrow', Arial, sans-serif`,
  fontMono: `'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace`,
} as const;
