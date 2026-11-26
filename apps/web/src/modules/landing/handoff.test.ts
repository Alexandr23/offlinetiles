import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { consumeLandingHandoff, LANDING_HANDOFF_KEY, writeLandingHandoff } from './handoff';

const memory = new Map<string, string>();

const sessionStorageMock = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memory.set(k, v);
  },
  removeItem: (k: string) => {
    memory.delete(k);
  },
  clear: () => memory.clear(),
};

const selection = {
  geometry: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [55.2, 25.1],
        [55.3, 25.1],
        [55.3, 25.2],
        [55.2, 25.2],
        [55.2, 25.1],
      ],
    ],
  },
};

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorageMock, configurable: true });
});

afterEach(() => {
  memory.clear();
});

describe('landing handoff', () => {
  it('round-trips a valid payload', () => {
    writeLandingHandoff({ selection, presetId: 'dark', content: 'vector' });
    const out = consumeLandingHandoff();
    expect(out).toEqual({ v: 1, selection, presetId: 'dark', content: 'vector' });
    expect(consumeLandingHandoff()).toBeNull();
  });

  it('rejects invalid payloads', () => {
    sessionStorage.setItem(
      LANDING_HANDOFF_KEY,
      JSON.stringify({ v: 1, presetId: 'nope', content: 'vector', selection }),
    );
    expect(consumeLandingHandoff()).toBeNull();
  });
});
