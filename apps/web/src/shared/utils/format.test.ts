import { describe, expect, it } from 'vitest';
import {
  formatApprox,
  formatArea,
  formatBytes,
  formatCoord,
  formatDuration,
  formatInt,
  formatPercent,
  formatRate,
  formatRelative,
  formatZoomRange,
} from './format';

describe('format helpers', () => {
  it('formatInt groups digits and uses an em dash for unknown values', () => {
    expect(formatInt(1234567)).toBe('1,234,567');
    expect(formatInt(12.6)).toBe('13');
    expect(formatInt(null)).toBe('—');
    expect(formatInt(Number.NaN)).toBe('—');
  });

  it('formatBytes picks binary units and trims digits for large values', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.00 KB');
    expect(formatBytes(1536, 1)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB');
    expect(formatBytes(3 * 1024 ** 4)).toBe('3.00 TB');
    expect(formatBytes(undefined)).toBe('—');
  });

  it('formatDuration renders mm:ss or hh:mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(151_000)).toBe('02:31');
    expect(formatDuration(3_725_000)).toBe('01:02:05');
    expect(formatDuration(5_000, true)).toBe('00:00:05');
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(null)).toBe('—');
  });

  it('formatApprox rounds to the nearest friendly unit', () => {
    expect(formatApprox(400)).toBe('<1s');
    expect(formatApprox(45_000)).toBe('~45s');
    expect(formatApprox(2 * 60_000)).toBe('~2m');
    expect(formatApprox(80 * 60_000)).toBe('~1h 20m');
    expect(formatApprox(120 * 60_000)).toBe('~2h');
  });

  it('formatPercent clamps and formatArea switches units', () => {
    expect(formatPercent(0.256)).toBe('26%');
    expect(formatPercent(1.7)).toBe('100%');
    expect(formatPercent(-1, 1)).toBe('0.0%');
    expect(formatArea(0.0005)).toBe('500 m²');
    expect(formatArea(2.04)).toBe('2.0 km²');
    expect(formatArea(12345.6)).toBe('12,346 km²');
  });

  it('formatZoomRange, formatCoord and formatRate', () => {
    expect(formatZoomRange(5, 5)).toBe('Z5');
    expect(formatZoomRange(5, 14)).toBe('Z5–14');
    expect(formatCoord(43.7384, 'lat')).toBe('43.7384° N');
    expect(formatCoord(5.1, 'lat')).toBe('\u20075.1000° N');
    expect(formatCoord(-7.42, 'lon')).toBe('\u2007\u20077.4200° W');
    expect(formatCoord(123.4567, 'lon')).toBe('123.4567° E');
    expect(formatRate(null)).toBe('—');
    expect(formatRate(12.345)).toBe('12.3 tiles/s');
    expect(formatRate(2500)).toBe('2,500 tiles/s');
  });

  it('formatRelative is stable given an explicit now', () => {
    const now = Date.parse('2026-10-03T12:00:00Z');
    expect(formatRelative('2026-10-03T11:59:50Z', now)).toBe('just now');
    expect(formatRelative('2026-10-03T11:45:00Z', now)).toBe('15m ago');
    expect(formatRelative('2026-10-03T06:00:00Z', now)).toBe('6h ago');
    expect(formatRelative('2026-09-30T12:00:00Z', now)).toBe('3d ago');
    expect(formatRelative(null, now)).toBe('—');
  });
});
