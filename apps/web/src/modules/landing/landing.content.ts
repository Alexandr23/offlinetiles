/**
 * Landing copy. Single source for the React page, the build-time SEO tags, the no-JS fallback
 * and /llms.txt (see landing.static.ts and vite.config.ts).
 *
 * Written in sentence case — the page upper-cases it with CSS, so search snippets, screen
 * readers and agents still get normal text. Keep this file free of imports: Vite loads it
 * from the config as well as from the app.
 */

export const SITE = {
  name: 'OfflineTiles',
  url: 'https://offlinetiles.com',
  editorPath: '/editor',
  title: 'OfflineTiles — Select, Style and Generate Offline MBTiles',
  description:
    'Select an area, pick one of five styles and generate vector or raster MBTiles. Set the zoom, check the estimate, and download one file cut to your polygon.',
  ogImage: '/og.png',
  ogImageAlt:
    'OfflineTiles: offline maps, cut to shape. Draw an area, pick a style, download MBTiles. A polygon cuts the tile grid so the file holds only the selected map.',
  themeColor: '#070b12',
} as const;

export const HERO = {
  headline: ['Offline', 'Tiles'],
  body: 'Select. Style. Generate. Use.',
  primaryCta: 'Open editor',
  secondaryCta: 'How it works',
} as const;

export const SPECS = [
  { label: 'Output', value: 'MBTiles' },
  { label: 'Tiles', value: 'Vector MVT / Raster PNG' },
] as const;

/** The cutting-edge diagram: its alt text. Feature 06 is the diagram's own block. */
export const CUT = {
  diagramAlt:
    'A grid of map tiles with a polygon drawn over it. Tiles outside the polygon are left out, and tiles on the edge are cut so the file holds only the map you picked.',
} as const;

export const FEATURES_SECTION = {
  kicker: 'Features',
  headline: 'Map too big?',
  headlineAccent: 'Cut it.',
} as const;

export type Feature = { readonly title: string; readonly body?: string };

export const FEATURES: readonly Feature[] = [
  {
    title: 'Any area',
    body: 'Draw a rectangle or a polygon, or search for a country and take its border.',
  },
  {
    title: 'Your style',
    body: 'Five presets: Light, Dark, Streets, Minimal, Outdoor. Tune colors, road widths, labels and layers live.',
  },
  {
    title: 'Vector or raster',
    body: 'MVT vector tiles or PNG raster tiles at 256 or 512 px. You set the zoom range.',
  },
  {
    title: 'Exact estimates',
    body: 'Tile count, file size and time before you generate. The tile count is exact.',
  },
  {
    title: 'One file, fully offline',
    body: 'A standard .mbtiles file for MapLibre, QGIS or anything else that reads MBTiles.',
  },
  {
    title: 'Cutting-edge technology',
    body: 'Literally. We cut your tiles along the edge of your polygon, so the file holds only the map you picked.',
  },
];

export const STEPS = {
  kicker: 'How it works',
  headline: 'Sounds hard?',
  headlineAccent: 'Four steps.',
  items: [
    { title: 'Select area', body: 'Draw a rectangle or a polygon, or pick a country.' },
    { title: 'Style', body: 'Start from a preset, then tune colors, labels and layers.' },
    { title: 'Generate', body: 'Choose vector or raster and a zoom range, check the estimate, start.' },
    { title: 'Use offline', body: 'Download the .mbtiles file and load it in your app or device.' },
  ],
} as const;

export const USE_CASES = {
  kicker: 'Use cases',
  headline: 'No internet?',
  headlineAccent: 'No problem.',
  items: [
    {
      title: 'Mobile apps',
      body: 'Travel, outdoor, navigation.',
      image: '/landing/usecase-mobile.jpg',
      alt: 'Hiker in the mountains holding a phone with an offline map. Mobile apps for travel, outdoor and navigation.',
    },
    {
      title: 'Field work',
      body: 'Surveying, research, logistics.',
      image: '/landing/usecase-field.jpg',
      alt: 'Surveyor with a tablet map beside a total station. Field work for surveying, research and logistics.',
    },
    {
      title: 'Business',
      body: 'Delivery, sales, operations.',
      image: '/landing/usecase-business.jpg',
      alt: 'Phone map on a delivery van dashboard next to parcels. Business maps for delivery, sales and operations.',
    },
    {
      title: 'Developers',
      body: 'Integrate into your apps.',
      image: '/landing/usecase-devs.jpg',
      alt: 'Laptop and a monitor of map tiles. Developers integrating an offline MBTiles file into apps.',
    },
    {
      title: 'Education',
      body: 'Teaching and study.',
      image: '/landing/usecase-edu.jpg',
      alt: 'Teacher and students around a tablet map in a classroom. Education for teaching and study.',
    },
  ],
} as const;

export const CLOSING = {
  cta: 'Open editor',
} as const;

export const CONTACT = {
  kicker: 'Contact us',
  headline: 'Interested?',
  headlineAccent: 'Tell us.',
  body: 'Tell us what you are building. We will follow up with early access notes.',
  email: 'offlinetiles.contact@gmail.com',
  location: 'UAE, Dubai',
} as const;

export const ATTRIBUTION = {
  text: 'Map data © OpenStreetMap contributors',
  href: 'https://www.openstreetmap.org/copyright',
} as const;
