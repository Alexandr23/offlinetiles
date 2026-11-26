/**
 * Design tokens. Exposed as CSS variables by GlobalStyle and referenced from
 * styled-components via `var(--token)` so the whole UI shares one visual language.
 */
export const tokens = {
  color: {
    background: '#090c11',
    surface1: '#0e131a',
    surface2: '#131a23',
    surface3: '#19222d',
    surfaceHover: '#1e2936',
    surfaceActive: '#243244',
    overlay: 'rgba(9, 12, 17, 0.72)',

    borderSubtle: 'rgba(148, 176, 204, 0.12)',
    borderStrong: 'rgba(148, 176, 204, 0.24)',
    borderActive: '#4fd1ff',

    textPrimary: '#e8eef5',
    textSecondary: '#b6c4d4',
    textMuted: '#8a9bb0',
    textInverse: '#07090d',

    accent: '#4fd1ff',
    accentStrong: '#7fdfff',
    accentMuted: 'rgba(79, 209, 255, 0.16)',
    accentGlow: 'rgba(79, 209, 255, 0.35)',

    /** Map selection shapes — soft pink, so they stand apart from the cyan UI and blue water. */
    selection: '#ff85b3',
    selectionStrong: '#ffb3d0',

    success: '#3ddc97',
    successMuted: 'rgba(61, 220, 151, 0.16)',
    warning: '#f5b942',
    warningMuted: 'rgba(245, 185, 66, 0.16)',
    danger: '#ff5c6c',
    dangerMuted: 'rgba(255, 92, 108, 0.16)',
    info: '#8b9cff',

    selectionFill: 'rgba(79, 209, 255, 0.12)',
    selectionStroke: '#4fd1ff',
  },
  font: {
    sans: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`,
    mono: `"JetBrains Mono", "SF Mono", "Fira Code", Menlo, Consolas, "Liberation Mono", monospace`,
  },
  fontSize: {
    xs: '10px',
    sm: '11px',
    md: '12.5px',
    lg: '14px',
    xl: '17px',
    xxl: '22px',
  },
  fontWeight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  space: {
    0: '0px',
    1: '2px',
    2: '4px',
    3: '6px',
    4: '8px',
    5: '12px',
    6: '16px',
    7: '20px',
    8: '24px',
    9: '32px',
    10: '48px',
  },
  radius: {
    xs: '2px',
    sm: '3px',
    md: '4px',
    lg: '6px',
    round: '999px',
  },
  shadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.4)',
    md: '0 6px 18px rgba(0, 0, 0, 0.45)',
    lg: '0 16px 40px rgba(0, 0, 0, 0.55)',
    glow: '0 0 0 1px rgba(79, 209, 255, 0.45), 0 0 18px rgba(79, 209, 255, 0.25)',
  },
  z: {
    map: 0,
    mapOverlay: 10,
    panel: 20,
    header: 30,
    dropdown: 100,
    popover: 110,
    tooltip: 120,
    modal: 200,
    toast: 300,
  },
  duration: {
    fast: '120ms',
    base: '180ms',
    slow: '260ms',
    slower: '420ms',
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.3, 0, 0, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
    spring: 'cubic-bezier(0.34, 1.3, 0.64, 1)',
  },
  layout: {
    rightPanelWidth: '340px',
  },
} as const;

export type Tokens = typeof tokens;

function toKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** Flattens the token tree into CSS custom property declarations. */
export function tokensToCssVariables(): string {
  const lines: string[] = [];
  const walk = (prefix: string, obj: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(obj)) {
      const name = prefix ? `${prefix}-${toKebab(key)}` : toKebab(key);
      if (typeof value === 'object' && value !== null) {
        walk(name, value as Record<string, unknown>);
      } else {
        lines.push(`--${name}: ${String(value)};`);
      }
    }
  };
  walk('', tokens as unknown as Record<string, unknown>);
  return lines.join('\n  ');
}
