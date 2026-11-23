const intFormatter = new Intl.NumberFormat('en-US');

export function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return intFormatter.format(Math.round(n));
}

export function formatBytes(bytes: number | null | undefined, digits = 2): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : digits)} ${units[i]}`;
}

/** 00:02:31 style; hours omitted when zero unless `forceHours`. */
export function formatDuration(ms: number | null | undefined, forceHours = false): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0 || forceHours) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

/** Human friendly ~2m / ~45s / ~1h 20m. */
export function formatApprox(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return '<1s';
  const s = Math.round(ms / 1000);
  if (s < 60) return `~${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `~${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `~${h}h ${rm}m` : `~${h}h`;
}

export function formatPercent(ratio: number | null | undefined, digits = 0): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return '—';
  return `${(Math.min(1, Math.max(0, ratio)) * 100).toFixed(digits)}%`;
}

export function formatArea(km2: number | null | undefined): string {
  if (km2 === null || km2 === undefined || !Number.isFinite(km2)) return '—';
  if (km2 < 1) return `${(km2 * 1_000_000).toFixed(0)} m²`;
  if (km2 < 100) return `${km2.toFixed(1)} km²`;
  return `${formatInt(km2)} km²`;
}

export function formatZoomRange(min: number, max: number): string {
  return min === max ? `Z${min}` : `Z${min}–${max}`;
}

export function formatCoord(value: number, axis: 'lat' | 'lon'): string {
  const hemi = axis === 'lat' ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  // Pad the integer part so monospace readouts don't shift while the cursor moves
  // (lat ≤ 90 → 2 digits, lon ≤ 180 → 3 digits).
  const abs = Math.abs(value).toFixed(4);
  const [intPart = '0', frac = '0000'] = abs.split('.');
  const width = axis === 'lat' ? 2 : 3;
  return `${intPart.padStart(width, '\u2007')}.${frac}° ${hemi}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const diff = now - Date.parse(iso);
  const s = Math.round(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function formatRate(tilesPerSecond: number | null | undefined): string {
  if (!tilesPerSecond || !Number.isFinite(tilesPerSecond)) return '—';
  if (tilesPerSecond >= 100) return `${formatInt(tilesPerSecond)} tiles/s`;
  return `${tilesPerSecond.toFixed(1)} tiles/s`;
}
