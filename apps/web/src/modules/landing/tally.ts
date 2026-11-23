/** OfflineTiles lead form → https://tally.so/r/GxNBkZ */

export const TALLY_FORM_ID = 'GxNBkZ';
export const TALLY_FORM_URL = `https://tally.so/r/${TALLY_FORM_ID}`;
const TALLY_RESPOND_URL = `https://api.tally.so/forms/${TALLY_FORM_ID}/respond`;

/** Field group UUIDs from the published Tally form. */
export const TALLY_FIELDS = {
  email: 'a7affd28-c231-4d3e-83b2-46197375eb80',
  intendedUse: 'ee086e33-5b8a-4aae-a3b7-0562c118a7b5',
  features: '8da02d34-8bce-462f-8b7b-07d481302750',
  willingnessToPay: 'be2ec021-1a1a-4755-adcd-b668ae5bf762',
  feedback: 'ca447be1-55d1-47ad-9cea-28c820eaadaf',
  marketingConsent: '86559c9f-8b98-46b1-bfd9-7bd2de9294a7',
  hidden: 'e86e514c-e553-45ce-b9af-3c74437b4c4d',
} as const;

export const TALLY_HIDDEN = {
  generation_id: '4fe9687b-4c0f-4517-9c2f-1f0ebdf49212',
  source: 'e3b1f8d8-dda0-43e5-820b-d8489dd31434',
  utm_source: '48d93d8a-ce85-4ebf-8bc9-27cdba8073c1',
  utm_campaign: '658e995d-4f8b-4040-816e-297bcc13dfe5',
} as const;

export const INTENDED_USE_OPTIONS = [
  { label: 'Software / App Development', id: '71b084d9-078b-47b5-90bf-0f957dbe8cb6' },
  { label: 'GIS / Geospatial', id: '3295f50c-82ed-4c69-9aee-5ddca3fd375e' },
  { label: 'Navigation / Outdoor', id: '7310ef08-6957-4d39-b5c7-bc51bfb321fa' },
  { label: 'Business / Commercial', id: '815d8147-309d-4c98-afd1-64482773b29a' },
  { label: 'Personal / Hobby', id: 'ed81b1e7-fc91-4815-acad-56fd00b2819f' },
  { label: 'Just Exploring', id: '0738225b-fd05-4a2a-80db-2a8c53f86a7f' },
  { label: 'Other', id: 'b3018df4-dbd8-45b7-b637-bda011a41286' },
] as const;

export const FEATURE_OPTIONS = [
  { label: 'Vector MBTiles', id: 'c6c3c6dc-64be-4550-8f9f-b2e708ac267c' },
  { label: 'Raster MBTiles', id: '9fc06515-fdc6-4508-997e-4c91f3fa1e36' },
  { label: 'Custom Map Styles', id: '1ce7679c-8f95-44dc-a81c-d1f25e1bf0c6' },
  { label: 'Large Regions', id: '5233452d-a22c-4a67-8481-0c3699f92d61' },
  { label: 'High Zoom Levels', id: 'fed17222-99e8-423e-b3ff-3b0f9b0cecf1' },
  { label: 'API Access', id: 'a1140318-b51f-43c2-829e-af5df02aa079' },
] as const;

export const WILLINGNESS_OPTIONS = [
  { label: 'Yes', id: 'cf03b992-38f8-47f6-a86f-f92254d159c8' },
  { label: 'Maybe', id: '612c08a3-3de7-485d-a98c-2aae55f17608' },
  { label: 'No', id: 'd523faba-8556-420b-91db-db7bd85e3d7d' },
] as const;

export const MARKETING_CONSENT_OPTION_ID = '50696d7f-eaaa-45c4-9094-709d170efdcc';

export interface LeadFormValues {
  email: string;
  intendedUseId: string;
  featureIds: string[];
  willingnessId: string;
  feedback: string;
  marketingConsent: boolean;
  generationId?: string;
  source?: string;
  utmSource?: string;
  utmCampaign?: string;
}

export interface TallySubmitResult {
  submissionId: string;
  respondentId: string;
}

function newUuid(): string {
  return crypto.randomUUID();
}

/** Builds the Tally `/respond` payload and posts it. */
export async function submitLeadToTally(values: LeadFormValues): Promise<TallySubmitResult> {
  const responses: Record<string, unknown> = {
    [TALLY_FIELDS.email]: values.email.trim(),
    [TALLY_FIELDS.intendedUse]: values.intendedUseId,
    [TALLY_FIELDS.hidden]: {
      [TALLY_HIDDEN.generation_id]: values.generationId?.trim() || '',
      [TALLY_HIDDEN.source]: values.source?.trim() || 'landing',
      [TALLY_HIDDEN.utm_source]: values.utmSource?.trim() || '',
      [TALLY_HIDDEN.utm_campaign]: values.utmCampaign?.trim() || '',
    },
  };

  if (values.featureIds.length > 0) {
    responses[TALLY_FIELDS.features] = values.featureIds;
  }
  if (values.willingnessId) {
    responses[TALLY_FIELDS.willingnessToPay] = values.willingnessId;
  }
  if (values.feedback.trim()) {
    responses[TALLY_FIELDS.feedback] = values.feedback.trim();
  }
  if (values.marketingConsent) {
    responses[TALLY_FIELDS.marketingConsent] = [MARKETING_CONSENT_OPTION_ID];
  }

  const res = await fetch(TALLY_RESPOND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sessionUuid: newUuid(),
      respondentUuid: newUuid(),
      responses,
      isCompleted: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Tally submit failed (${res.status})`);
  }

  return (await res.json()) as TallySubmitResult;
}

export function readLeadQueryDefaults(search = typeof window !== 'undefined' ? window.location.search : ''): Pick<
  LeadFormValues,
  'generationId' | 'source' | 'utmSource' | 'utmCampaign'
> {
  const params = new URLSearchParams(search);
  return {
    generationId: params.get('generation_id') ?? undefined,
    source: params.get('source') ?? 'landing',
    utmSource: params.get('utm_source') ?? undefined,
    utmCampaign: params.get('utm_campaign') ?? undefined,
  };
}
