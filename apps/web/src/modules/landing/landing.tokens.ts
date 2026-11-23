/** Landing-only visual tokens (OfflineTiles marketing). Scoped under `.landing`. */
export const landingTokens = {
  bg: '#0B1220',
  bgElevated: '#111827',
  glass: 'rgba(15, 23, 42, 0.72)',
  glassBorder: 'rgba(148, 163, 184, 0.18)',
  accent: '#3B82F6',
  accentHover: '#60A5FA',
  accentMuted: 'rgba(59, 130, 246, 0.18)',
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  radius: '16px',
  radiusSm: '12px',
  maxWidth: '1120px',
  heroCenter: [55.27, 25.2] as [number, number],
  heroZoom: 11.2,
} as const;

/** Public preview styles for the hero map (OpenFreeMap). Real presets apply in /editor. */
export const LANDING_PREVIEW_STYLES: Record<string, string> = {
  dark: 'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/liberty',
  streets: 'https://tiles.openfreemap.org/styles/liberty',
  minimal: 'https://tiles.openfreemap.org/styles/dark',
  outdoor: 'https://tiles.openfreemap.org/styles/liberty',
};

export const LANDING_PRESET_OPTIONS = [
  { id: 'dark' as const, label: 'Dark' },
  { id: 'light' as const, label: 'Light' },
  { id: 'minimal' as const, label: 'Minimal' },
  { id: 'streets' as const, label: 'Navigation' },
  { id: 'outdoor' as const, label: 'Outdoor' },
];
