import { describe, expect, it } from 'vitest';
import { colorAlpha, hexToRgb, luminance, normalizeHexColor, rgbToHex, withAlpha } from './color';

describe('color helpers', () => {
  it('normalizes the color syntaxes MapLibre styles use into #rrggbb', () => {
    expect(normalizeHexColor('#ABC')).toBe('#aabbcc');
    expect(normalizeHexColor('#aabbcc')).toBe('#aabbcc');
    expect(normalizeHexColor('#aabbcc80')).toBe('#aabbcc');
    expect(normalizeHexColor('rgb(255, 0, 128)')).toBe('#ff0080');
    expect(normalizeHexColor('rgba(0,0,0,0.5)')).toBe('#000000');
    expect(normalizeHexColor('hsl(0, 100%, 50%)')).toBe('#ff0000');
    expect(normalizeHexColor('hsl(120, 100%, 25%)')).toBe('#008000');
    expect(normalizeHexColor('white')).toBe('#ffffff');
    expect(normalizeHexColor('')).toBeNull();
    expect(normalizeHexColor('not a color')).toBeNull();
    expect(normalizeHexColor(['interpolate'])).toBeNull();
  });

  it('round-trips rgb/hex and clamps channels', () => {
    expect(rgbToHex(255, 128, 0)).toBe('#ff8000');
    expect(rgbToHex(300, -5, 12.6)).toBe('#ff000d');
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0]);
    expect(hexToRgb('garbage')).toEqual([0, 0, 0]);
  });

  it('reads alpha and re-applies it', () => {
    expect(colorAlpha('rgba(1,2,3,0.25)')).toBe(0.25);
    expect(colorAlpha('hsla(1,2%,3%,2)')).toBe(1);
    expect(colorAlpha('#11223380')).toBeCloseTo(128 / 255);
    expect(colorAlpha('transparent')).toBe(0);
    expect(colorAlpha('#123456')).toBe(1);
    expect(colorAlpha(undefined)).toBe(1);
    expect(withAlpha('#ff8000', 1)).toBe('#ff8000');
    expect(withAlpha('#ff8000', 0.3333)).toBe('rgba(255,128,0,0.333)');
  });

  it('computes relative luminance for contrast decisions', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ff0000')).toBeCloseTo(0.2126, 4);
    expect(luminance('#1b1f27')).toBeLessThan(0.05);
  });
});
