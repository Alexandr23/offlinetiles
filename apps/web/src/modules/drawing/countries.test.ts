import { describe, expect, it } from 'vitest';
import { searchCountries, type CountryRecord } from './countries';

const sample: CountryRecord[] = [
  {
    id: 'FR',
    name: 'France',
    aliases: ['Frankreich', 'Francia'],
    geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
  },
  {
    id: 'DE',
    name: 'Germany',
    aliases: ['Deutschland'],
    geometry: { type: 'Polygon', coordinates: [[[2, 2], [3, 2], [3, 3], [2, 3], [2, 2]]] },
  },
  {
    id: 'FI',
    name: 'Finland',
    aliases: [],
    geometry: { type: 'Polygon', coordinates: [[[4, 4], [5, 4], [5, 5], [4, 5], [4, 4]]] },
  },
];

describe('searchCountries', () => {
  it('matches by name prefix and alias', () => {
    expect(searchCountries(sample, 'fran').map((c) => c.id)).toEqual(['FR']);
    expect(searchCountries(sample, 'deutsch').map((c) => c.id)).toEqual(['DE']);
  });

  it('matches ISO id and ranks exact matches first', () => {
    expect(searchCountries(sample, 'FI').map((c) => c.id)).toEqual(['FI']);
    expect(searchCountries(sample, 'f').map((c) => c.id)[0]).toBe('FI');
  });

  it('returns a short default list for empty query', () => {
    expect(searchCountries(sample, '', 2)).toHaveLength(2);
  });
});
