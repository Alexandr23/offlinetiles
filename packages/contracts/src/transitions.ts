import type { GenerationStatus } from './enums.js';

/**
 * Central generation state machine.
 *
 *   QUEUED -> GENERATING -> PACKAGING -> COMPLETED
 *   QUEUED -> CANCELLED
 *   GENERATING -> FAILED | CANCELLED
 *   PACKAGING  -> FAILED | CANCELLED
 *
 * Terminal statuses (COMPLETED / FAILED / CANCELLED) have no outgoing transitions.
 * Retry is modelled as a brand new generation, not a transition.
 */
const ALLOWED: Readonly<Record<GenerationStatus, readonly GenerationStatus[]>> = {
  QUEUED: ['GENERATING', 'CANCELLED'],
  GENERATING: ['PACKAGING', 'FAILED', 'CANCELLED'],
  PACKAGING: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransition(from: GenerationStatus, to: GenerationStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function allowedTransitions(from: GenerationStatus): readonly GenerationStatus[] {
  return ALLOWED[from];
}

export class InvalidTransitionError extends Error {
  readonly from: GenerationStatus;
  readonly to: GenerationStatus;

  constructor(from: GenerationStatus, to: GenerationStatus) {
    super(`Invalid generation status transition: ${from} -> ${to}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function assertTransition(from: GenerationStatus, to: GenerationStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}
