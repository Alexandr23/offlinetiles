import type { MapLibreStyle, MapStyle } from '@map-exporter/contracts';
import type { Db } from '../../db/client.js';

interface StyleRow {
  id: string;
  name: string;
  base_preset: string | null;
  style_json: MapLibreStyle;
  created_at: Date;
  updated_at: Date;
  user_id: string | null;
}

function toDto(row: StyleRow): MapStyle {
  return {
    id: row.id,
    name: row.name,
    basePreset: row.base_preset,
    style: row.style_json,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    userId: row.user_id ?? null,
  };
}

export class StyleRepository {
  constructor(private readonly db: Db) {}

  async listForUser(userId: string): Promise<MapStyle[]> {
    const rows = await this.db<StyleRow[]>`
      SELECT id, name, base_preset, style_json, created_at, updated_at, user_id
      FROM map_styles
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC
    `;
    return rows.map(toDto);
  }

  async findById(id: string): Promise<MapStyle | null> {
    const rows = await this.db<StyleRow[]>`
      SELECT id, name, base_preset, style_json, created_at, updated_at, user_id
      FROM map_styles
      WHERE id = ${id}
    `;
    return rows[0] ? toDto(rows[0]) : null;
  }

  async insert(input: {
    id: string;
    name: string;
    basePreset: string | null;
    style: MapLibreStyle;
    userId: string;
  }): Promise<MapStyle> {
    const rows = await this.db<StyleRow[]>`
      INSERT INTO map_styles (id, name, base_preset, style_json, user_id)
      VALUES (${input.id}, ${input.name}, ${input.basePreset}, ${this.db.json(input.style as never)}, ${input.userId})
      RETURNING id, name, base_preset, style_json, created_at, updated_at, user_id
    `;
    return toDto(rows[0]!);
  }

  async update(id: string, patch: { name?: string; style?: MapLibreStyle }): Promise<MapStyle | null> {
    const rows = await this.db<StyleRow[]>`
      UPDATE map_styles
      SET
        name = COALESCE(${patch.name ?? null}, name),
        style_json = COALESCE(${patch.style ? this.db.json(patch.style as never) : null}, style_json),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, base_preset, style_json, created_at, updated_at, user_id
    `;
    return rows[0] ? toDto(rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db<{ id: string }[]>`DELETE FROM map_styles WHERE id = ${id} RETURNING id`;
    return rows.length > 0;
  }
}
