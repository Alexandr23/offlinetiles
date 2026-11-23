import type { ApiErrorCode } from '@map-exporter/contracts';

export class AppError extends Error {
  readonly code: ApiErrorCode | string;
  readonly statusCode: number;
  readonly details: unknown;

  constructor(code: ApiErrorCode | string, message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  static notFound(what: string, id?: string): AppError {
    return new AppError('NOT_FOUND', id ? `${what} ${id} not found` : `${what} not found`, 404);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError('VALIDATION_ERROR', message, 400, details);
  }

  static conflict(message: string): AppError {
    return new AppError('CONFLICT', message, 409);
  }

  static datasetNotReady(): AppError {
    return new AppError('DATASET_NOT_READY', 'Master dataset is not initialized. Run `pnpm init-map`.', 503);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError('UNAUTHORIZED', message, 401);
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError('FORBIDDEN', message, 403);
  }

  static internal(message = 'Internal error'): AppError {
    return new AppError('INTERNAL_ERROR', message, 500);
  }
}
