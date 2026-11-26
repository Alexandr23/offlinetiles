import { randomUUID } from 'node:crypto';
import type { InterestSubmission } from '@map-exporter/contracts';
import type { Db } from '../../db/client.js';

interface InterestRow {
  id: string;
  email: string | null;
  intended_use: InterestSubmission['intendedUse'];
  features: InterestSubmission['features'];
  willingness: InterestSubmission['willingness'];
  feedback: string | null;
  marketing_consent: boolean;
  source: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  generation_id: string | null;
  created_at: Date;
}

/** Postgres `text[]` type id, so an empty array still binds. */
const TEXT_ARRAY = 1009;

export type NewInterest = Omit<InterestSubmission, 'id' | 'createdAt'>;

function toSubmission(row: InterestRow): InterestSubmission {
  return {
    id: row.id,
    email: row.email,
    intendedUse: row.intended_use,
    features: row.features,
    willingness: row.willingness,
    feedback: row.feedback,
    marketingConsent: row.marketing_consent,
    source: row.source,
    utmSource: row.utm_source,
    utmCampaign: row.utm_campaign,
    generationId: row.generation_id,
    createdAt: row.created_at.toISOString(),
  };
}

export class InterestRepository {
  constructor(private readonly db: Db) {}

  async create(input: NewInterest): Promise<InterestSubmission> {
    const [row] = await this.db<InterestRow[]>`
      INSERT INTO interest_submissions (
        id, email, intended_use, features, willingness, feedback, marketing_consent,
        source, utm_source, utm_campaign, generation_id
      ) VALUES (
        ${randomUUID()}, ${input.email}, ${input.intendedUse}, ${this.db.array(input.features, TEXT_ARRAY)},
        ${input.willingness}, ${input.feedback}, ${input.marketingConsent},
        ${input.source}, ${input.utmSource}, ${input.utmCampaign}, ${input.generationId}
      )
      RETURNING *
    `;
    return toSubmission(row!);
  }

  async list(limit: number, offset: number): Promise<{ submissions: InterestSubmission[]; total: number }> {
    const rows = await this.db<InterestRow[]>`
      SELECT * FROM interest_submissions ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
    `;
    const [count] = await this.db<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM interest_submissions`;
    return { submissions: rows.map(toSubmission), total: count?.total ?? 0 };
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db`DELETE FROM interest_submissions WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }
}
