# Static data

## `countries.json`

Country polygons derived from [Natural Earth](https://www.naturalearthdata.com/)
`ne_10m_admin_0_countries` (public domain). Coordinates are rounded to 5 decimals;
only extreme rings are lightly simplified (soft cap ~12k vertices) so coastlines
keep high boundary detail for display and export.

Regenerate:

```bash
pnpm build-countries
# or with a local GeoJSON:
pnpm build-countries -- --input /path/to/ne_10m_admin_0_countries.geojson
```

Selecting a country loads the complete geometry; every vertex is drawn on the map.
Interior rings (enclaves) are kept for export but stripped when feeding Terra Draw,
which does not accept polygon holes.
