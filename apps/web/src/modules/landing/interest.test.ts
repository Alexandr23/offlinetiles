import { describe, expect, it } from 'vitest';
import { EMAIL_RE, readLeadQueryDefaults } from './interest';

describe('readLeadQueryDefaults', () => {
  it('reads utm and generation params', () => {
    expect(readLeadQueryDefaults('?utm_source=twitter&utm_campaign=launch&generation_id=abc&source=editor')).toEqual({
      generationId: 'abc',
      source: 'editor',
      utmSource: 'twitter',
      utmCampaign: 'launch',
    });
  });

  it('defaults source to landing', () => {
    expect(readLeadQueryDefaults('')).toEqual({
      generationId: undefined,
      source: 'landing',
      utmSource: undefined,
      utmCampaign: undefined,
    });
  });
});

describe('EMAIL_RE', () => {
  it('accepts an address and rejects obvious typos', () => {
    expect(EMAIL_RE.test('you@offlinetiles.com')).toBe(true);
    for (const bad of ['', 'you', 'you@', 'you@x', 'a b@c.de']) expect(EMAIL_RE.test(bad)).toBe(false);
  });
});
