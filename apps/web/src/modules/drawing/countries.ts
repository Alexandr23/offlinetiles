import type { SelectionGeometry } from '@map-exporter/contracts';

export interface CountryRecord {
  id: string;
  name: string;
  aliases: string[];
  geometry: SelectionGeometry;
}

interface CountryIndexFile {
  type: 'CountryIndex';
  version: number;
  countries: CountryRecord[];
}

let cache: CountryRecord[] | null = null;
let loadPromise: Promise<CountryRecord[]> | null = null;

/** Lazy-load Natural Earth–derived country polygons (public/data/countries.json). */
export async function loadCountries(): Promise<CountryRecord[]> {
  if (cache) return cache;
  if (!loadPromise) {
    loadPromise = fetch('/data/countries.json')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load countries (${res.status})`);
        const data = (await res.json()) as CountryIndexFile;
        cache = data.countries ?? [];
        return cache;
      })
      .catch((err) => {
        loadPromise = null;
        throw err;
      });
  }
  return loadPromise;
}

export function searchCountries(countries: CountryRecord[], query: string, limit = 10): CountryRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return countries.slice(0, limit);

  const scored: { country: CountryRecord; score: number }[] = [];
  for (const country of countries) {
    const name = country.name.toLowerCase();
    const id = country.id.toLowerCase();
    let score = -1;
    if (name === q || id === q) score = 0;
    else if (name.startsWith(q) || id.startsWith(q)) score = 1;
    else if (name.includes(q)) score = 2;
    else if (country.aliases.some((a) => a.toLowerCase().includes(q))) score = 3;
    if (score >= 0) scored.push({ country, score });
  }

  scored.sort((a, b) => a.score - b.score || a.country.name.localeCompare(b.country.name));
  return scored.slice(0, limit).map((s) => s.country);
}
