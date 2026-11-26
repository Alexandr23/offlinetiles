import type { CreateInterestRequest } from '@map-exporter/contracts';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Where the visitor came from, taken from the page URL; sent along with the form. */
export function readLeadQueryDefaults(
  search = typeof window !== 'undefined' ? window.location.search : '',
): Pick<CreateInterestRequest, 'generationId' | 'source' | 'utmSource' | 'utmCampaign'> {
  const params = new URLSearchParams(search);
  return {
    generationId: params.get('generation_id') ?? undefined,
    source: params.get('source') ?? 'landing',
    utmSource: params.get('utm_source') ?? undefined,
    utmCampaign: params.get('utm_campaign') ?? undefined,
  };
}
