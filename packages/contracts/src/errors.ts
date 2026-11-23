export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_ZOOM_RANGE',
  'INVALID_GEOMETRY',
  'INVALID_STYLE',
  'TILE_LIMIT_EXCEEDED',
  'ZOOM_LIMIT_EXCEEDED',
  'GENERATION_LIMIT_EXCEEDED',
  'AREA_LIMIT_EXCEEDED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'DATASET_NOT_READY',
  'INVALID_TRANSITION',
  'ARTIFACT_MISSING',
  'CONFLICT',
  'INTERNAL_ERROR',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode | string;
    message: string;
    details?: unknown;
  };
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const err = (value as { error?: unknown }).error;
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { code?: unknown }).code === 'string' &&
    typeof (err as { message?: unknown }).message === 'string'
  );
}
