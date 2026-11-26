import { z } from 'zod';

/**
 * "Contact us" / interest form on the landing page. Options are stored by id, so the labels can be
 * reworded without touching saved submissions; the admin dashboard resolves ids back to labels.
 */

export const INTENDED_USE_OPTIONS = [
  { id: 'software', label: 'Software / App Development' },
  { id: 'gis', label: 'GIS / Geospatial' },
  { id: 'navigation', label: 'Navigation / Outdoor' },
  { id: 'business', label: 'Business / Commercial' },
  { id: 'personal', label: 'Personal / Hobby' },
  { id: 'exploring', label: 'Just Exploring' },
  { id: 'other', label: 'Other' },
] as const;

export const FEATURE_OPTIONS = [
  { id: 'vector', label: 'Vector tiles' },
  { id: 'raster', label: 'Raster tiles' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'styles', label: 'Custom Map Styles' },
  { id: 'regions', label: 'Large Regions' },
  { id: 'zoom', label: 'High Zoom Levels' },
  { id: 'api', label: 'API Access' },
] as const;

export const WILLINGNESS_OPTIONS = [
  { id: 'yes', label: 'Yes' },
  { id: 'maybe', label: 'Maybe' },
  { id: 'no', label: 'No' },
] as const;

const ids = <T extends readonly { id: string }[]>(options: T) =>
  options.map((o) => o.id) as [T[number]['id'], ...T[number]['id'][]];

export const IntendedUseSchema = z.enum(ids(INTENDED_USE_OPTIONS));
export const FeatureSchema = z.enum(ids(FEATURE_OPTIONS));
export const WillingnessSchema = z.enum(ids(WILLINGNESS_OPTIONS));

export const INTEREST_LIMITS = { email: 254, feedback: 2000, tag: 120 } as const;

const optionalTag = z
  .string()
  .trim()
  .max(INTEREST_LIMITS.tag)
  .optional()
  .transform((v) => v || undefined);

export const CreateInterestRequestSchema = z
  .object({
    /** Only needed (and only asked for) when the visitor agrees to receive updates. */
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(INTEREST_LIMITS.email)
      .optional()
      .transform((v) => v || undefined)
      .refine((v) => v === undefined || z.email().safeParse(v).success, 'Enter a valid email address'),
    intendedUse: IntendedUseSchema,
    features: z
      .array(FeatureSchema)
      .max(FEATURE_OPTIONS.length)
      .default([])
      .transform((list) => [...new Set(list)]),
    willingness: WillingnessSchema.optional(),
    feedback: z
      .string()
      .trim()
      .max(INTEREST_LIMITS.feedback)
      .optional()
      .transform((v) => v || undefined),
    marketingConsent: z.boolean().default(false),
    /** Where the visitor came from; filled from the page URL. */
    source: optionalTag,
    utmSource: optionalTag,
    utmCampaign: optionalTag,
    generationId: optionalTag,
  })
  .refine((v) => !v.marketingConsent || v.email !== undefined, {
    path: ['email'],
    message: 'Email is required to receive updates',
  });
export type CreateInterestRequest = z.input<typeof CreateInterestRequestSchema>;

export interface InterestSubmission {
  id: string;
  /** Null when the visitor did not ask for updates. */
  email: string | null;
  intendedUse: z.infer<typeof IntendedUseSchema>;
  features: z.infer<typeof FeatureSchema>[];
  willingness: z.infer<typeof WillingnessSchema> | null;
  feedback: string | null;
  marketingConsent: boolean;
  source: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  generationId: string | null;
  createdAt: string;
}

export interface InterestListResponse {
  submissions: InterestSubmission[];
  /** Total stored, which can exceed the page returned. */
  total: number;
}
