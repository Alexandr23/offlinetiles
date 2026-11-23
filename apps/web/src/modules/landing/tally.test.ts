import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FEATURE_OPTIONS,
  INTENDED_USE_OPTIONS,
  MARKETING_CONSENT_OPTION_ID,
  readLeadQueryDefaults,
  submitLeadToTally,
  TALLY_FIELDS,
  TALLY_HIDDEN,
} from './tally';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

describe('submitLeadToTally', () => {
  it('posts mapped responses to Tally', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ submissionId: 'sub1', respondentId: 'res1' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000001' });

    const use = INTENDED_USE_OPTIONS[0]!;
    const feat = FEATURE_OPTIONS[0]!;

    await submitLeadToTally({
      email: 'you@offlinetiles.com',
      intendedUseId: use.id,
      featureIds: [feat.id],
      willingnessId: '',
      feedback: 'hi',
      marketingConsent: true,
      source: 'landing',
      utmSource: 'x',
      utmCampaign: 'y',
      generationId: 'g1',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.isCompleted).toBe(true);
    expect(body.responses[TALLY_FIELDS.email]).toBe('you@offlinetiles.com');
    expect(body.responses[TALLY_FIELDS.intendedUse]).toBe(use.id);
    expect(body.responses[TALLY_FIELDS.features]).toEqual([feat.id]);
    expect(body.responses[TALLY_FIELDS.feedback]).toBe('hi');
    expect(body.responses[TALLY_FIELDS.marketingConsent]).toEqual([MARKETING_CONSENT_OPTION_ID]);
    expect(body.responses[TALLY_FIELDS.hidden]).toEqual({
      [TALLY_HIDDEN.generation_id]: 'g1',
      [TALLY_HIDDEN.source]: 'landing',
      [TALLY_HIDDEN.utm_source]: 'x',
      [TALLY_HIDDEN.utm_campaign]: 'y',
    });
  });
});
