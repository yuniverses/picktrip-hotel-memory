# PickTrip Hotel Experience Extraction Audit

Source audited: `/Users/chenguanyu/Documents/picktrip/Picktrip_web_app`
Target: `/Users/chenguanyu/Documents/picktrip/memory-test`
Audit mode: read-only source inspection; no source files changed.

## Executive finding

The live hotel surface already proves the product interaction the hackathon demo needs: an advisor SSE turn can stream hotel recommendations, grounded POIs, areas, filters, and a hero hotel into a Mapbox map. It is not, however, a small reusable feature module in implementation terms. The live `results.tsx`, map, advisor dialog, and card total 8,192 lines before their supporting modules, and include booking, shared workspaces, auth, pricing, mobile shells, Spotlight, and Mapbox camera policy. Copying them wholesale would import most of PickTrip rather than isolate hotel memory.

The safe extraction boundary is therefore contractual:

1. preserve the upstream hotel-search request/response shape;
2. preserve the hotel-pin and POI-pin data semantics;
3. preserve the useful advisor event vocabulary (`text`, `hotels`, `poi`, `hero`, `done`, `error`);
4. build a deliberately small results/map/chat shell in the standalone app;
5. replace the existing single-shot PickTrip advisor route with a Mastra + Elasticsearch conversation/memory route.

This is not a rejection of existing code reuse. The reusable part is the proven contract and interaction policy. The existing full components cannot be reused directly because they carry unrelated host, commerce, workspace, pricing, and camera responsibilities.

## 1. Reachability and live mount graph

The new stay experience is live, not proposal-only or orphaned:

```text
/order
  page.tsx
    -> OrderPurchaseCenter
       -> StayExperience when category=hotel && stayUi=next
          -> LabLanding or LabResults from URL state
             -> POST /api/hotel/search
             -> POST /api/hotel/lowest-prices (optional for minimal demo)
             -> POST /api/hotel/advise (legacy PickTrip advisor)
             -> dynamic import stay-map.tsx

/labs/hotel-experience (development only)
  -> StayExperience

/stay/[slug] (shared workspace)
  -> StayExperience shareMode
```

Evidence:

- `/order` resolves the stay rollout server-side and passes it to the live purchase center: `src/app/order/page.tsx:45-75`.
- The live branch is exactly `displayedCategory === "hotel" && stayUi === "next"`: `src/components/order/order-purchase-center.tsx:130-139`.
- That branch mounts `StayExperience`: `src/components/order/order-purchase-center.tsx:350-374`.
- The rollout defaults to `on` when unset: `src/lib/stay/rollout.ts:63-73`; `on` resolves to the next UI: `src/lib/stay/rollout.ts:119-127`.
- The dev-only lab mounts the same module, with a production 404: `src/app/labs/hotel-experience/page.tsx:6-23`.
- The shared stay route mounts the same module with a hydrated workspace: `src/app/stay/[slug]/page.tsx:23-50`.
- `StayExperience` chooses landing/results from URL/workspace state and mounts `LabResults`: `src/components/stay/stay-experience.tsx:126-156`, `src/components/stay/stay-experience.tsx:259-280`.
- `LabResults` dynamically imports the real results map: `src/components/stay/results.tsx:173-184`.

## 2. Actual hotel search contract

### Browser-to-standalone-BFF request

The current browser helper calls `POST /api/hotel/search` with:

```ts
type HotelSearchRequest = {
  q?: string;
  countryCode?: string;
  cityName?: string;
  hitsPerPage?: number; // schema: 1..50
  page?: number;        // zero-based
  currency?: string;    // exactly 3 chars
  geo?: { lat: number; lng: number; radiusKm?: number };
  polygon?: [number, number][][]; // mutually exclusive with geo
  starRating?: number;  // 1..5, minimum rating
  facilities?: string[];
  minPrice?: number;
  maxPrice?: number;
};
```

Evidence:

- Client helper request type and the client-only `selectedHotelId` stripping: `src/lib/stay/stay-data.ts:281-333`.
- Authoritative Zod schema, bounds, and geo/polygon mutual exclusion: `src/app/api/hotel/_lib/search-schema.ts:21-103`.
- Destination semantics are important: country -> `countryCode`; canonical city -> exact `cityName` + country; verified city/POI/address -> `geo`; custom -> `q`: `src/lib/stay/destination-intent.ts:30-69`.
- The result page sends 15 hits, page 0, currency TWD, and searchable advisor filters: `src/components/stay/results.tsx:831-860`, `src/components/stay/results.tsx:935-943`.

### BFF-to-PickTrip upstream request

The BFF ultimately calls:

```text
POST ${PICKTRIP_API_URL}/app/shopping/hotel/search
Content-Type: application/json
Authorization: Bearer <session-token>   // only when present
```

Evidence:

- Upstream path and body forwarding: `src/lib/picktrip-api.ts:900-943`.
- Backend base URL comes from `PICKTRIP_API_URL` (or legacy `APP_BASE_URL`): `src/lib/picktrip-api.ts:3347-3375`.
- Development should use `https://beta-api.picktrip.app`: repository `AGENTS.md:22-28`; `.env.example:4-6`.
- Search is optional-auth: the BFF deliberately omits Authorization for anonymous users: `src/app/api/hotel/search/route.ts:18-34`; unit proof: `src/app/api/hotel/search/route.test.ts:17-48`.

### Search response

The normalized upstream/BFF result is:

```ts
type HotelSearchResult = {
  hits: Array<{
    hotelId: string;
    name: string;
    nameEn: string;
    starRating: number;
    ratingScore: number | null;
    reviewCount: number;
    categoryName: string;
    primaryImage: string;
    latitude: number;
    longitude: number;
    address: string;
    cityName: string;
    countryCode: string;
    countryName: string;
    destinationName: string;
    highlights: string[];
    minPriceCache: { amount: number; currency: string } | null;
    siteId: string;
  }>;
  totalHits: number;
  page: number;
  totalPages: number;
  hitsPerPage: number;
  query: string;
};
```

Evidence:

- Public normalized types: `src/lib/picktrip-api.ts:82-110`.
- Raw API accepts coordinates either flat or under `location`: `src/lib/picktrip-api.ts:825-858`.
- Normalization and pagination defaults: `src/lib/picktrip-api.ts:945-991`.
- The current UI narrows each hit to `LabHotelHit`, retaining coordinates, image, address, ratings, and highlights but dropping `minPriceCache`: `src/lib/stay/stay-data.ts:191-203`, `src/lib/stay/stay-data.ts:327-359`.

### Price is a second, non-minimal pipeline

The real results page intentionally treats search as “coordinates, no displayed prices” and then calls `/lowest-prices`: `src/components/stay/results.tsx:3-9`. The price route requires a PickTrip session token: `src/app/api/hotel/lowest-prices/route.ts:27-48`. A minimal hackathon demo should omit live price/booking or display the search response's `minPriceCache` explicitly as an estimate. Copying the full price/rooms pipeline would introduce auth, occupancy folding, room cache, and supplier semantics unrelated to memory.

## 3. Map provider, environment, and pin contracts

### Provider/runtime requirements

- Provider: Mapbox GL JS, `mapbox-gl` 3.25.0: `package.json:30-39`.
- Public token: `NEXT_PUBLIC_MAPBOX_TOKEN`: `.env.example:27-31`; current results reads it at `src/components/stay/results.tsx:2787` and renders an explicit missing-token state at `src/components/stay/results.tsx:3364-3367`.
- Results basemap: `mapbox://styles/mapbox/streets-v12`: `src/components/stay/stay-map.tsx:98-102`.
- The map component imports Mapbox's own CSS: `src/components/stay/stay-map.tsx:16-18`.
- It is browser-only and loaded with `ssr: false`: `src/components/stay/results.tsx:184`.
- It requires WebGL; failure degrades to a list-safe notice: `src/components/stay/stay-map.tsx:2456-2463`.

### Hotel pin

```ts
type HotelMapPin = {
  id: string;       // hotelId
  lat: number;
  lng: number;
  label: string | null; // formatted price or null -> dot
  saved: boolean;
  dimmed?: boolean;
  recommended?: boolean;
};
```

Evidence:

- Authoritative datum: `src/lib/stay/stay-markers.ts:16-37`.
- `recommended` gets an accent class and is exempt from decluttering: `src/lib/stay/stay-markers.ts:42-59`, `src/lib/stay/stay-markers.ts:75-94`.
- Results derives pins from map entities and marks the advisor hero via `recommended`: `src/components/stay/results.tsx:2108-2145`.
- Map reconciles hotel markers by `id`, updates coordinates/HTML in place, and removes disappeared ids: `src/components/stay/stay-map.tsx:970-1032`.
- Required injected marker CSS is the `.hx-pin*` block: `src/components/stay/stay-experience.css:170-375`.

### AI/place POI pin

```ts
type PoiMapPin = {
  id: string; // Google placeId or another stable id
  name: string;
  lat: number;
  lng: number;
  category: "station" | "cafe" | "food" | "attraction" | "transport" | "other";
  reason: string;
  imageUrl?: string | null;
  siteId?: string | null;
  address?: string | null;
};
```

Evidence:

- Category union and datum: `src/lib/stay/stay-poi.ts:22-50`.
- Category-to-icon marker HTML and reason tooltip: `src/lib/stay/stay-poi.ts:99-149`.
- Map renders each POI at `[lng, lat]` and toggles it by stable `id`: `src/components/stay/stay-map.tsx:749-787`.
- Required injected marker CSS is the `.hx-poi*` block: `src/components/stay/stay-experience.css:377-515`.

### Existing full map prop surface

`stay-map.tsx` accepts hotel markers, persistent workspace markers, POIs, advised areas, selection/hover callbacks, viewport search callbacks, camera ownership, advisor phase, and locator mode: `src/components/stay/stay-map.tsx:194-316`. This confirms it is not a minimal hotel-pin widget.

## 4. Current AI conversation behavior

### Wire transport

The existing advisor client posts `{ message, conversationId? }` to `/api/hotel/advise` and parses data-only SSE frames through `parseAdviseEvent`: `src/lib/stay/stay-data.ts:446-499`.

The BFF then calls root `POST /agent/chat` with `agent: "stay-advisor"`, `locale: "zh-TW"`, and `currency: "TWD"`: `src/app/api/hotel/advise/route.ts:38-47`, `src/app/api/hotel/advise/route.ts:99-120`. It translates the broad PickTrip agent stream to the narrow UI event union: `src/app/api/hotel/advise/route.ts:144-183`.

The useful existing event vocabulary is:

```ts
type AdviseEvent =
  | { kind: "step"; step: AdviseStep }
  | { kind: "text"; delta: string }
  | { kind: "filters"; filters: StayFilters; reason: string }
  | { kind: "area"; area: StayArea }
  | { kind: "hotels"; areaId: string; hits: CompactHit[] }
  | { kind: "poi"; poi: PoiMapPin }
  | { kind: "hero"; hero: { hotelId: string; reason: string; evidence: string[] } }
  | { kind: "done" }
  | { kind: "error"; message: string };
```

Evidence: `src/lib/stay/advise-stream.ts:32-122`. The reducer is resilient to repeated/out-of-order events and append-merges POIs/hotels within one turn: `src/lib/stay/advise-stream.ts:194-205`, `src/lib/stay/advise-stream.ts:208-350`.

### It is single-shot, despite having a follow-up composer

The current stay advisor is not a multi-turn conversation:

- Each advisor effect explicitly omits `conversationId`, starts a fresh backend conversation, and resets the entire `AdviseState`: `src/components/stay/results.tsx:1075-1118`.
- The UI follow-up is appended to the URL-backed `requirements` text, not sent as a second turn: `src/components/stay/results.tsx:1614-1639`.
- The composer itself only passes the new text to that append callback: `src/components/stay/advise-dock.tsx:482-495`, `src/components/stay/advise-dock.tsx:834-885`.
- The BFF schema supports `conversationId`, but documents why this surface does not reuse it: the PickTrip stay advisor pins a destination anchor to the conversation's first area and cannot reset it: `src/app/api/hotel/advise/route.ts:49-62`.
- The contract document confirms that every run creates a new conversation and has no memory between runs: `docs/hotel-lab/2026-08-11-advise-event-contract.md:121-141`.
- The dialog shows one purpose and one current `state.summary`, not a transcript: `src/components/stay/advise-dock.tsx:621-683`.

PickTrip's general `useAgentChat` is a true multi-turn reference implementation: it owns `messages`, `conversationId`, and a synchronous `convRef`: `src/components/ai-chat/use-agent-chat.ts:181-221`; every send passes the current conversation id and captures the returned id: `src/components/ai-chat/use-agent-chat.ts:229-315`. It should not be copied into the standalone demo because it is coupled to PickTrip trip planning, rich modules, batch updates, attachments, history, and the PickTrip agent API. Reuse its state pattern, not the module.

## 5. What to extract and what not to extract

### Extract/adapt

1. **Hotel search contract** — adapt the Zod fields from `search-schema.ts` and the response normalization from `picktrip-api.ts`. Keep the standalone route small; do not copy the 3,000+ line generic API wrapper.
2. **Hotel result presentation fields** — use `LabHotelHit` as the minimal card model: `src/lib/stay/stay-data.ts:191-203`.
3. **Pin semantics** — preserve `LabMapMarkerDatum` and `LabPoiDatum` field names/categories. Transplant only the required HTML/CSS behavior or implement equivalent React-created Mapbox markers.
4. **Advisor event concepts** — preserve `text`, `poi`, `hotels`, `hero`, `done`, and `error`. They already map cleanly to “each turn adds pins.” Add a turn boundary event or keep one reducer per turn.
5. **Interaction policy** — hotel/POI pin selection should select/scroll, not replace or reorder the list; the existing policy is documented and implemented at `src/components/stay/results.tsx:2246-2269`.
6. **Map marker diffing by stable id** — reuse the `Map<string, Marker>` reconciliation idea from `src/components/stay/stay-map.tsx:986-1032`, so new turns append pins without rebuilding the map.

### Do not extract wholesale

| Module | Why not |
|---|---|
| `components/stay/results.tsx` (3,710 lines) | Owns search paging, price/rooms, workspace persistence/sharing, Spotlight, filters, saved state, login modal, mobile shell, booking modal, camera policy, and legacy advisor state. |
| `components/stay/stay-map.tsx` (2,501 lines) | Owns areas, polygons, POI cards, workspace markers, decluttering, camera narration, viewport searching, locator maps, partner skins, and dev instrumentation. Its prop surface proves the breadth (`:194-316`). |
| `components/stay/advise-dock.tsx` (891 lines) | One-summary/single-purpose UI, voice dictation, filters, areas, hero hotel-card slot, progress rail, motion/dialog behavior; not a conversation transcript. |
| `components/stay/hotel-card.tsx` (1,090 lines) | Includes lazy rooms/detail, live pricing, carousels, saving, booking, responsive behavior. A hackathon card needs only image/name/rating/address/reason. |
| `lib/stay/stay-data.ts` (623 lines) | Mixes search, price, rooms, advisor, booking, itinerary, and image APIs. Lift only the small fetch contracts. |
| `lib/stay/search-state.ts` (249 lines) | URL contract also owns party, rooms, filters, refine state, destination providers, and host query merging. The standalone demo can use local search state plus explicit URL params if needed. |
| `components/ai-chat/use-agent-chat.ts` | Correct multi-turn state pattern but deeply bound to PickTrip agent/chat rich events and trip mutation lifecycle, not Mastra. |

Approximate source sizes are from `wc -l` on the current worktree; they are included to make the dependency cost explicit, not as a code-quality judgment.

## 6. Recommended standalone boundary for Mastra + Elasticsearch

Use three independent layers:

```text
Hotel search
  POST /api/hotels/search
  -> PickTrip beta /app/shopping/hotel/search
  -> HotelHit[]

Conversation + memory
  POST /api/chat { userId, threadId, message, searchContext }
  -> Mastra agent
  -> Elasticsearch preference recall/write
  -> SSE events: text | preference | hotels | poi | hero | done | error

UI projection
  transcript: append user/assistant messages by turn
  hotel list: merge recommendations by hotelId
  hotel pins: merge by hotelId
  POI pins: merge by stable place id
  selected hero: replace only the hero designation
```

Required multi-turn state should be explicit and separate from map projection:

```ts
type ConversationState = {
  userId: string;
  threadId: string;
  messages: Array<{ id: string; role: "user" | "assistant"; text: string }>;
  streaming: boolean;
};

type MapState = {
  hotelPinsById: Map<string, HotelMapPin>;
  poiPinsById: Map<string, PoiMapPin>;
  recommendedHotelIds: Set<string>;
};
```

Do not reuse the current `AdviseState` instance across turns unchanged. Its `done` phase is terminal and the live page resets it before every run (`results.tsx:1100-1103`). Instead, keep a per-turn response reducer and fold its map-producing events into the cumulative `MapState`. This directly satisfies “every turn may add pins” without letting a new response erase earlier pins.

For destination changes, start a new map/search context but keep Elasticsearch user preferences. The existing PickTrip `conversationId` destination-anchor limitation does not need to be inherited because the standalone Mastra thread and preference memory are a new system. The thread should carry conversational continuity; Elasticsearch should carry cross-thread/cross-search user preference continuity.

## 7. Environment checklist for the target app

Minimum variables implied by this audit:

```dotenv
PICKTRIP_API_URL=https://beta-api.picktrip.app
NEXT_PUBLIC_MAPBOX_TOKEN=pk....

# Exact Mastra/Elasticsearch variable names should follow the implementation's
# selected packages and deployment, but keep Elasticsearch credentials server-only.
ELASTICSEARCH_URL=...
ELASTICSEARCH_API_KEY=...
```

The Mapbox token is intentionally public and should be URL-restricted in production: `.env.example:27-31`. PickTrip/Elasticsearch credentials must stay in route/server code.

## 8. Existing verification assets and gaps

- Hotel search anonymous/session forwarding has route tests: `src/app/api/hotel/search/route.test.ts:17-104`.
- Advisor event fold/parser/snapshot behavior has unit coverage: `src/lib/stay/advise-stream.test.ts:58-220` and later cases in the same file.
- Map provides a dev-only verification handle because WebGL canvas pins are not DOM-queryable: `src/components/stay/stay-map.tsx:329-350`; usage is documented at `docs/hotel-lab/2026-08-11-advise-event-contract.md:143-183`.
- There is no sibling `src/app/api/hotel/advise/route.test.ts` in the current tree. The translator has its own tests, but the route's auth/forwarding/terminal-stream behavior is not directly covered by a route test.
- `picktrip-api.ts` warns that the `polygon` parameter for the web search endpoint is not settled against the backend: `src/lib/picktrip-api.ts:884-897`. The standalone MVP should use `q` or `geo`, not polygon, unless the backend is re-verified.

## Final extraction decision

Build the standalone demo as a small new shell using the proven PickTrip search and pin contracts. Do not copy the live surface wholesale. The closest existing full components cannot be used because they embed product-scale commerce/workspace/camera responsibilities and the current advisor is intentionally single-shot. The minimal contract extraction still preserves the important behavior: real PickTrip hotel results, Mapbox hotel/POI pins, progressive AI output, hero recommendations, and stable id-based pin accumulation—while allowing Mastra and Elasticsearch to own the new multi-turn memory mechanism.
