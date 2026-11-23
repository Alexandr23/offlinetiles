const NAMED: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  transparent: '#000000',
};

/** Normalizes #rgb / #rrggbb / rgb() / rgba() / hsl() into #rrggbb, or null when unparsable. */
export function normalizeHexColor(input: unknown): string | null {
  if (typeof input !== 'string' || !input) return null;
  const s = input.trim().toLowerCase();
  if (NAMED[s]) return NAMED[s]!;
  const hex = s.startsWith('#') ? s.slice(1) : s;
  if (/^[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex)) {
    return `#${hex.slice(0, 6)}`;
  }
  const rgb = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgb) {
    return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]));
  }
  const hsl = s.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
  if (hsl) {
    const [r, g, b] = hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
    return rgbToHex(r, g, b);
  }
  return null;
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = normalizeHexColor(hex) ?? '#000000';
  return [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16)];
}

/** Parses the alpha channel from rgba()/hsla()/#rrggbbaa; 1 when opaque. */
export function colorAlpha(input: string | undefined | null): number {
  if (!input) return 1;
  const s = input.trim().toLowerCase();
  const m = s.match(/^(?:rgba|hsla)\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/);
  if (m) return Math.min(1, Math.max(0, Number(m[1])));
  if (/^#[0-9a-f]{8}$/.test(s)) return parseInt(s.slice(7, 9), 16) / 255;
  if (s === 'transparent') return 0;
  return 1;
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return alpha >= 1 ? rgbToHex(r, g, b) : `rgba(${r},${g},${b},${Number(alpha.toFixed(3))})`;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let [r, g, b] = [0, 0, 0];
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/** Relative luminance 0..1 for picking readable foreground. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
