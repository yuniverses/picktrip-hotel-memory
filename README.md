# PickTrip Hotel Memory

Standalone hackathon demo extracted at the contract boundary from PickTrip's `/order` hotel
experience. It keeps hotel search, result cards, Mapbox pins, filters, save entry, and a
multi-turn advisor; booking, rooms, and checkout are deliberately absent.

Live inventory and coordinates come only from existing PickTrip APIs. Mastra owns agent/tool
orchestration and durable multi-turn history. Elasticsearch owns authenticated preference and
conversation-event indexes. The browser never submits an authoritative user id: every memory
operation is partitioned by the user returned from PickTrip `/app/user/read/me`.

## Requirements

- Node **22.22.1+** (`/opt/homebrew/opt/node@22/bin/node` on this machine)
- A PickTrip beta account and Firebase Web app whose Authorized Domains include the demo host
- Mapbox public token, OpenRouter key, and Elasticsearch 9.3+
- Two terminals: Next UI on `3000`, Mastra Studio/server on `4111`

```bash
export PATH=/opt/homebrew/opt/node@22/bin:/usr/bin:/bin:/usr/sbin:/sbin
npm install
cp .env.example .env.local
```

Fill `.env.local`; never commit it. For local integration, the Next config reads only
`NEXT_PUBLIC_MAPBOX_TOKEN` from `../Picktrip_web_app/.env.local` (override with
`PICKTRIP_PUBLIC_ENV_PATH`). Firebase resolves explicit web env first, then
`../App-iOS/PickTrip/GoogleService-Info.plist` (override with
`PICKTRIP_IOS_GOOGLE_PLIST_PATH`), then Picktrip's public Firebase project config.
No server secret is imported from either source. `GET /api/configuration` reports only safe booleans/aliases,
never credentials. For local Elasticsearch, `docker compose up -d elasticsearch` works for base
indexing, but semantic fields require a configured Elastic inference endpoint. Elastic Cloud is
recommended for the hackathon.

## Versioned indexes and aliases

`npm run setup:indices` is intentionally explicit and idempotent. Review its plan before running:

| Physical index | Stable read/write alias | Purpose |
| --- | --- | --- |
| `picktrip-memory-preferences-v1` | `picktrip-memory-preferences` | Explainable durable preference events |
| `picktrip-memory-turns-v1` | `picktrip-memory-turns` | Auth-partitioned user/assistant turn events |

Preference mapping walkthrough (changing any field type later requires a new version + reindex):

| Field | Type | Why |
| --- | --- | --- |
| `preference_id` | `keyword` | Stable exact id for dedupe and evidence links |
| `resource_id` | `keyword` | Mandatory authenticated-user partition/filter |
| `thread_id` | `keyword` | Exact conversation provenance |
| `category`, `polarity`, `status` | `keyword` | Exact filters; never analyzed as prose |
| `statement` | `text` | BM25/lexical matching and human-readable evidence |
| `statement_semantic` | `semantic_text` | Meaning-based recall through the configured inference endpoint |
| `confidence` | `float` | Explainable extraction/ranking weight |
| `tags` | `keyword` array | Multi-value category filtering |
| `destination` | `keyword` | Exact destination scope without copying inventory |
| `source_message_id` | `keyword` | Trace back to the originating turn |
| `created_at`, `updated_at` | `date` | Recency and future time-decay support |

Conversation-turn mapping walkthrough:

| Field | Type | Why |
| --- | --- | --- |
| `event_id` | `keyword` | Stable event identity |
| `resource_id`, `thread_id` | `keyword` | User isolation and multi-turn continuity |
| `role` | `keyword` | Exact `user`/`assistant` filter |
| `message` | `text` | Auditable transcript text and keyword recall |
| `message_semantic` | `semantic_text` | Cross-thread semantic memory |
| `destination` | `keyword` | Exact trip context |
| `created_at` | `date` | Timeline ordering and decay |

The setup sequence per definition is:

1. `indices.exists({ index: physicalName })`
2. if absent, `indices.create({ index: physicalName, mappings })`
3. `indices.existsAlias({ name: alias })`
4. if absent, `indices.putAlias({ index: physicalName, name: alias, is_write_index: true })`

It never deletes, overwrites, or silently moves an existing alias. For `v2`, create and validate
the new physical index, migrate data, then move the alias in a separately reviewed operation.

After approval:

```bash
npm run setup:indices
```

## Run

```bash
npm run dev:mastra   # http://localhost:4111 — Studio + /hotel-chat
npm run dev:web      # http://localhost:3000 — product UI
```

Sign in with PickTrip, search a city, then send multiple turns such as:

1. `我通常很在意交通，希望靠近車站。`
2. `也幫我把附近咖啡廳標在地圖上。`

Pins use stable `hotel:<hotelId>` / `<kind>:<placeId>` ids and accumulate by upsert. Changing the
destination creates a new visible thread and clears hotel/POI pins, while Elasticsearch
preferences remain in the authenticated resource partition.

## Verification

```bash
npm test
npm run check
npm run type-check
npm run build
npm run smoke:mastra
```

`npm run build` is deliberately the console-clean Next production build. The current official
stable Mastra CLI (`mastra@1.25.1` / `@mastra/deployer@1.60.0`) has an upstream build-analysis
bug: `npm run build:mastra` logs an `ERR_INVALID_ARG_VALUE` for
`\0virtual:#entry/package.json`, catches it, and exits successfully. The generated server has been
runtime-smoked, but this repository does not hide that console error or patch `node_modules`.
The official alpha still contains the same vulnerable path handling; keep stable until Mastra
ships a fix. Track the [current source](https://github.com/mastra-ai/mastra/blob/main/packages/deployer/src/build/package-info.ts)
and [related ENOTDIR fix](https://github.com/mastra-ai/mastra/pull/19514). Use
`npm run smoke:mastra` plus `npm run dev:mastra` for the current source/runtime gate.

Mastra Studio traces should show `rememberPreference`, `recallPreferences`, and
`personalizeHotelMap`. If Mapbox is missing, the UI renders a clear non-interactive fallback. If
OpenRouter or Elasticsearch is missing, chat returns a visible configuration/runtime error rather
than fabricated data.

## Integration boundaries

- Hotel: `POST /app/shopping/hotel/search`
- Places: `POST /app/places/cards` (provider image targets are discarded)
- Identity: Firebase token exchange at `/app/signin`, then authoritative `/app/user/read/me`
- Agent: Mastra custom route `/hotel-chat`
- Memory: Mastra LibSQL transcript + Elasticsearch semantic recall, preference and turn indexes

No provider search engine, inventory, coordinate, price, or availability is mocked at runtime.
