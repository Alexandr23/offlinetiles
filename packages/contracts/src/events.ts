import type { Generation, GenerationProgress } from './generation.js';
import type { MapStyle } from './style.js';

export type SSEEvent =
  | { type: 'generation.created'; data: Generation }
  | { type: 'generation.started'; data: Generation }
  | { type: 'generation.progress'; data: GenerationProgress }
  | { type: 'generation.packaging'; data: Generation }
  | { type: 'generation.completed'; data: Generation }
  | { type: 'generation.failed'; data: Generation }
  | { type: 'generation.cancelled'; data: Generation }
  | { type: 'generation.deleted'; data: { id: string } }
  | { type: 'queue.changed'; data: { queued: number; currentId: string | null } }
  | { type: 'style.created'; data: MapStyle }
  | { type: 'style.updated'; data: MapStyle }
  | { type: 'style.deleted'; data: { id: string } };

export type SSEEventType = SSEEvent['type'];

export const SSE_EVENT_TYPES: readonly SSEEventType[] = [
  'generation.created',
  'generation.started',
  'generation.progress',
  'generation.packaging',
  'generation.completed',
  'generation.failed',
  'generation.cancelled',
  'generation.deleted',
  'queue.changed',
  'style.created',
  'style.updated',
  'style.deleted',
];

export type SSEEventDataOf<T extends SSEEventType> = Extract<SSEEvent, { type: T }>['data'];
