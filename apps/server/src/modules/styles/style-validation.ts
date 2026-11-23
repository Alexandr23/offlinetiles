import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import type { MapLibreStyle } from '@map-exporter/contracts';
import { AppError } from '../../shared/errors/app-error.js';

export interface StyleValidationIssue {
  message: string;
  line?: number;
}

export function validateMapLibreStyle(style: unknown): StyleValidationIssue[] {
  const errors = validateStyleMin(style as never) as Array<{ message: string; line?: number }>;
  return errors.map((e) => ({ message: e.message, line: e.line }));
}

export function assertValidStyle(style: MapLibreStyle): void {
  const issues = validateMapLibreStyle(style);
  if (issues.length > 0) {
    throw new AppError('INVALID_STYLE', `Style is invalid: ${issues[0]!.message}`, 400, issues);
  }
}
