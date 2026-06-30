# Campus Dining API

Hono service for discovering US university dining menu coverage and serving a
stable API surface for provider-specific menu adapters.

Live demo:

```text
https://campus-dining.endohealth.ai
```

GitHub:

```text
https://github.com/EndoHealth/campus-dining-api
```

## Commands

```bash
npm install
npm run db:migrate -- --name init
npm run db:seed
npm run dev
npm test
npm run build
npm run db:import-collection -- data/collections/top50-live-menus-2026-06-30.json
npm run crawl:menus
npm run db:prune
npm run collect:live
npm run collect:max-data
npm run verify:live
```

Default local URL:

```text
http://localhost:3400
```

## API

```http
GET /health
GET /health/db
GET /health/ready
GET /
GET /schools/:schoolId
GET /v1/demo-summary
GET /v1/coverage
GET /v1/schools?query=stanford&status=confirmed&provider=official_api
GET /v1/schools/:schoolId
GET /v1/schools/:schoolId/locations
GET /v1/schools/:schoolId/service-windows?date=2026-06-30&type=food_truck
GET /v1/schools/:schoolId/menus?date=2026-06-29&meal=lunch&locationId=...
```

Menu routes are intentionally adapter-gated. A school can be listed as
`confirmed` for source availability while live normalized menu fetching remains
`adapter_pending` until a stable direct provider fetch path is implemented and
tested.

`GET /schools/:schoolId` renders a school-level calendar UI. It uses the live
locations endpoint first when available, renders cafeteria tabs, and fetches
only the active cafeteria's menu with `locationId`. Providers without a
lightweight locations endpoint fall back to full-date menu data and build tabs
from the returned normalized locations. The same page supports
`?view=food-trucks`; that view fetches `service-windows` and renders public food
truck schedule cards by date instead of cafeteria menu stations.

Menu API responses are cached in memory for 30 minutes by school/date/meal/
location and expose `X-Campus-Cache` plus `X-Campus-Cache-Age` headers. When
`READ_MENUS_FROM_DB=true`, fresh Postgres rows can satisfy menu requests before
provider fetches and responses include `X-Campus-Store: database`. Provider
errors use a shorter 5 minute cache and can fall back to same-date stored rows
with `X-Campus-Store: database_stale`.

## Database

Persistent storage uses Prisma 7 with Postgres. Local development defaults to
the shared Docker Postgres on `localhost:5432`:

```text
postgresql://postgres:postgres@localhost:5432/campus_dining_api
```

`GET /health` stays DB-independent for fast process health checks.
`GET /health/db` verifies the Prisma/Postgres connection. `GET /health/ready`
checks DB connectivity plus the seeded school catalog. The schema stores
schools, data sources, crawl runs, raw snapshot metadata, locations, vendors,
service windows, menus, periods, stations, items, nutrition facts, ingredient
facts, allergen facts, and future LLM estimate runs. Large raw provider bodies
should be stored by path/hash metadata rather than as full database rows.

Set `PERSIST_MENUS_TO_DB=true` to persist adapter-ready menu responses on cache
misses. By default this is off so local API tests do not require a writable DB.
Use `npm run db:import-collection -- <collection.json>` to backfill existing
collection files into Postgres.

Food trucks are modeled as `Location.type = food_truck` plus dated
`ServiceWindow` rows. A schedule can exist without item-level menus or
nutrition. If future enrichment estimates nutrition, the item or service window
must stay explicitly labeled as estimated.

Production mode should run with:

```text
PERSIST_MENUS_TO_DB=true
READ_MENUS_FROM_DB=true
FALLBACK_TO_STALE_DB_ON_PROVIDER_ERROR=true
```

`npm run crawl:menus` is the scheduled ingestion job. It writes one `CrawlRun`
per school, persists adapter-ready menus, and exits non-zero only when failures
exceed `CRAWL_MAX_FAILURES`. Useful scheduler env:

```text
CRAWL_DATE=2026-06-30
CRAWL_SCHOOLS=princeton,yale
CRAWL_CONCURRENCY=2
FETCH_ATTEMPTS=3
```

`npm run db:prune` removes old menus and crawl metadata according to
`MENU_RETENTION_DAYS` and `CRAWL_RUN_RETENTION_DAYS`. Use `PRUNE_DRY_RUN=true`
before enabling destructive pruning in a new environment.

## Deployment

The demo is deployed on the Mac mini at:

```text
/Users/ops/Projects/campus-dining-api
```

Runtime is `PORT=3410` behind a Cloudflare Tunnel for
`campus-dining.endohealth.ai`. `launchd` jobs:

```text
com.endohealth.campus-dining-api
com.endohealth.campus-dining-tunnel
```

No `.env` or collected JSON data is committed. Use `.env.example` for local
runtime defaults. Production and Mac mini deploys must set `DATABASE_URL`
explicitly before enabling DB read/write flags.

Production rollout order:

```bash
npm ci
npm run db:deploy
npm run db:seed
npm run build
npm start
```

After build, a runtime-only install can omit dev dependencies as long as the
generated Prisma client and compiled `dist/` output are already present:

```bash
npm ci --omit=dev
npm start
```

Current `npm audit --omit=dev` reports a moderate advisory through Prisma
CLI's internal `@prisma/dev` dependency. The latest stable Prisma package is
already installed; the automated audit fix downgrades Prisma across a breaking
major version, so it is not applied here. Keep Prisma updated when a patched
stable release is available.

## Current Live Coverage

Latest verification output:

```text
data/probes/top50-live-fetch-2026-06-29.json
data/collections/top50-live-menus-2026-06-30.json
data/collections/top50-best-available-menus-2026-06-30.json
```

For the 2026-06-30 menu date, 47 of the Top 50 schools return normalized live
menu JSON: Princeton, MIT, Harvard, Stanford, Yale, Northwestern, Duke, Johns
Hopkins, UPenn, Caltech, Cornell, Brown, Dartmouth, Columbia, UC Berkeley, Rice, UCLA,
Vanderbilt, Carnegie Mellon, Michigan, Notre Dame, WashU, Emory, Georgetown,
UNC Chapel Hill, UVA, USC, UC San Diego, UT Austin, Georgia Tech, NYU, UC Davis,
UC Irvine, Boston College, Tufts, UIUC, UW Madison, UCSB, Ohio State, Boston
University, Rutgers, Maryland, University of Washington, Lehigh, Purdue,
University of Georgia, and University of Rochester.

The latest exact-date live collection file contains 18,979 normalized menu
items from adapter-ready schools, including 17,292 items with nutrition, 17,339
with ingredients, 12,003 with allergens, and 13,623 with dietary tags. Allergen
coverage includes conservative item-level facts derived from source ingredient
allergen keys when an item has no direct allergen facts; ingredient-derived
keys use word-boundary matching to avoid substring false positives. Dietary
coverage also includes conservative source-text tags from item names and exact
program labels such as Vegan, Vegetarian Option, Halal, Kosher, and Gluten
Friendly.

`npm run collect:max-data` writes a separate best-available collection. It does
not change the default API semantics; it only fills adapter-ready zero-item
schools with the nearest non-empty date and records `dateFallback`. On
2026-06-30, this raises adapter-ready schools with item rows from 46 to 47 by
using Michigan's 2026-05-19 MaizeMeals data, yielding 19,524 total items.

Carnegie Mellon is adapter-ready for public CMUEats static menu PDFs with dated
location operating hours. This source provides item names and prices only, not
nutrition, ingredients, or allergens.

Columbia is adapter-ready through the official Columbia Dining page's
structured `menu_data` payload. Direct curl/Node fetches still hit Cloudflare,
so this adapter uses a real browser session and extracts official source data
without using a third-party proxy.

Northwestern is adapter-ready through a public Flik/Compass Northwestern Global
Hub weekly PDF menu. This is a stable campus dining subset; residential
DineOnCampus remains Cloudflare-blocked from this environment. The PDF source
provides item names and stations only, not nutrition, ingredients, or allergens.

## Current Non-Ready Notes

Three Top 50 schools remain intentionally non-ready until a stable direct source
is proven:

- UChicago, Florida, and Northeastern use DineOnCampus menu JSON. Public
  projects confirm the endpoint shapes and item richness, but direct
  server-side calls to `api.dineoncampus.com` and `apiv4.dineoncampus.com`
  return Cloudflare 403 from this environment. Menu API responses expose
  `adapter_pending` with `error: "cloudflare_403_direct_fetch"` for these
  schools.
- Northwestern NUFood exposes read-only `generalData`, but the current snapshot
  is stale and its scrape endpoints mutate the upstream database.
