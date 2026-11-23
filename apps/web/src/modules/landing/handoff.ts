import {
  AreaSelectionSchema,
  PRESET_IDS,
  type AreaSelection,
  type PresetId,
  type TileContent,
} from '@map-exporter/contracts';

export const LANDING_HANDOFF_KEY = 'offlinetiles:landing-handoff';

/** Soft cap for the hero limited editor (km²). */
export const LANDING_MAX_AREA_KM2 = 500;

export interface LandingHandoff {
  v: 1;
  selection: AreaSelection;
  presetId: PresetId;
  content: TileContent;
}

const PRESET_SET = new Set<string>(PRESET_IDS);

function isTileContent(v: unknown): v is TileContent {
  return v === 'vector' || v === 'raster';
}

function isPresetId(v: unknown): v is PresetId {
  return typeof v === 'string' && PRESET_SET.has(v);
}

export function writeLandingHandoff(data: Omit<LandingHandoff, 'v'>): void {
  const payload: LandingHandoff = { v: 1, ...data };
  sessionStorage.setItem(LANDING_HANDOFF_KEY, JSON.stringify(payload));
}

/** Reads and clears a pending landing → editor handoff, or returns null. */
export function consumeLandingHandoff(): LandingHandoff | null {
  const raw = sessionStorage.getItem(LANDING_HANDOFF_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(LANDING_HANDOFF_KEY);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.v !== 1) return null;
    if (!isPresetId(obj.presetId) || !isTileContent(obj.content)) return null;
    const selection = AreaSelectionSchema.safeParse(obj.selection);
    if (!selection.success) return null;
    return { v: 1, selection: selection.data, presetId: obj.presetId, content: obj.content };
  } catch {
    return null;
  }
}

export function peekLandingHandoff(): boolean {
  return sessionStorage.getItem(LANDING_HANDOFF_KEY) !== null;
}
