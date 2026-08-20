# Picktrip Hotel Memory：Mastra + Elasticsearch 技術契約

查核基準：2026-08-19（America/Los_Angeles）。

## 0. 證據標記

- 「VERIFIED」後方一定附可重查 URL，表示該事實由官方 Mastra 文件／repo、官方 Elastic 文件或活動官方 starter 原始碼支持。
- 「UNVERIFIED」表示目前沒有足夠官方證據，實作或 demo 前必須實測。
- 「CONTRACT」是本專案的設計決定，不是假稱外部框架已提供的功能。

## 1. 結論

CONTRACT：採「一個 repo、兩個開發程序」：

1. 既有 Picktrip 飯店搜尋／地圖 UI 跑在 3000；hotel/place/map live data 一律沿用既有 Picktrip API。
2. Mastra standalone server 與 Studio 跑在 4111。
3. UI 只呼叫 Mastra custom route "/hotel-chat"，不把 Elastic 或 LLM 金鑰送進瀏覽器。
4. Mastra Memory 用 LibSQL 保存完整多輪訊息；同一對話固定 thread、同一使用者固定 resource。
5. Mastra semantic recall 用 ElasticSearchVector，因此過往訊息的向量在 Elasticsearch。
6. 另外建立 "trip-preferences" Elasticsearch index，保存可解釋、可衰減、可被推薦工具引用的偏好事件。
7. 每輪 agent 可以呼叫 "rememberPreference" 與 "personalizeHotelMap"；後者只從既有 Picktrip hotel/place/map API 回傳的候選資料產生 pin，不允許模型捏造座標。
8. API 每輪回傳 typed "pinOperations"；前端以 id upsert，讓每輪可以累積或更新地圖 pin。

CONTRACT（明確非目標）：Mastra + Elasticsearch 不另建飯店、地點或地圖搜尋引擎，也不把 Picktrip inventory 複製進 preference index。既有 Picktrip API 是 live hotel/place/map data 的唯一 authoritative source；本層只負責多輪對話、偏好寫入／召回、既有 API tool orchestration、對 API 候選做可解釋的個人化排序，以及輸出 structured pin decisions。

CONTRACT：復用來源為 "/Users/chenguanyu/Documents/picktrip/Picktrip_web_app" 中既有 API clients、types 與 UI；實作時應 import／抽取既有 module，而不是在 memory-test 另寫一套 provider integration。

CONTRACT（runtime data flow）：

~~~text
Picktrip UI
  -> existing Picktrip hotel API -> current hotel candidates
  -> Mastra /hotel-chat
       -> Elastic preference recall
       -> existing Picktrip place/map API tools when extra POIs are needed
       -> deterministic personalization over returned candidates
  <- assistant text + structured pinOperations
  -> existing Picktrip map UI
~~~

Mastra 官方把 memory 定義為可保存 user/assistant/tool 訊息，並以 resource（使用者／實體）及 thread（單一對話）定位；目前呼叫 API 是 "memory: { resource, thread }"。
VERIFIED: https://mastra.ai/docs/memory/overview

Working memory 預設是 resource scope，可跨該使用者的不同 thread 保存偏好；semantic recall 預設停用，啟用時需要 storage、vector store 與 embedder。
VERIFIED: https://mastra.ai/docs/memory/working-memory
VERIFIED: https://mastra.ai/docs/memory/semantic-recall

活動 starter 已提供完全相同的核心拼法：LibSQL message storage + ElasticSearchVector + Elasticsearch Inference API embedder + resource-scoped semantic recall；本契約復用這個 pattern，不另造 memory adapter。
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/easy-win/src/mastra/agents/memory-agent.ts
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/easy-win/src/mastra/elastic-embedder.ts

## 2. 版本基線與 Node 門檻

以下版本是 2026-08-19 以 npm registry "latest" 與活動 starter 的 package-lock 交叉核對後的實作基線；CONTRACT：全部 exact pin，不用 caret。

| 套件 | exact version | 用途 | 證據 |
|---|---:|---|---|
| @mastra/core | 1.60.0 | Agent、Mastra registry、tools、server | VERIFIED: https://www.npmjs.com/package/@mastra/core/v/1.60.0 |
| @mastra/memory | 1.27.0 | message history、working memory、semantic recall | VERIFIED: https://www.npmjs.com/package/@mastra/memory/v/1.27.0 |
| @mastra/libsql | 1.21.0 | durable local conversation storage | VERIFIED: https://www.npmjs.com/package/@mastra/libsql/v/1.21.0 |
| @mastra/elasticsearch | 1.3.1 | Mastra ElasticSearchVector | VERIFIED: https://www.npmjs.com/package/@mastra/elasticsearch/v/1.3.1 |
| @mastra/observability | 1.17.1 | Studio traces | VERIFIED: https://www.npmjs.com/package/@mastra/observability/v/1.17.1 |
| mastra | 1.25.1 | "mastra dev/build/start" CLI | VERIFIED: https://www.npmjs.com/package/mastra/v/1.25.1 |
| @elastic/elasticsearch | 9.5.0 | index、ES|QL、Inference API | VERIFIED: https://www.npmjs.com/package/@elastic/elasticsearch/v/9.5.0 |
| @ai-sdk/provider | 2.0.3 | starter 的 EmbeddingModelV2 型別 | VERIFIED: https://www.npmjs.com/package/@ai-sdk/provider/v/2.0.3 |
| dotenv | 17.4.2 | 讓直接以 tsx 執行的 index setup script 載入 .env | VERIFIED: https://www.npmjs.com/package/dotenv/v/17.4.2 |
| zod | 3.25.76 | schemas；與 starter lock 一致 | VERIFIED: https://www.npmjs.com/package/zod/v/3.25.76 |

活動 starter package.json 寫 Node ">=20.20.0"，README 寫 Node "22.22+（或 20.20+）"；但同一份當天 package-lock 解析到的 Mastra 1.60.0 要求 Node ">=22.13.0"，Elastic client 9.5.0 要求 Node ">=22"。CONTRACT：以較嚴格條件為準，使用 Node >=22.13.0；建議 22.22+。目前研究環境是 Node 20.17.0，不能當作可執行驗證環境。
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/easy-win/package.json
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/easy-win/README.md
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/easy-win/package-lock.json
VERIFIED: https://github.com/mastra-ai/mastra/blob/main/DEVELOPMENT.md

### 最小 Mastra/Elastic package.json 片段

CONTRACT：這是 backend 必要集合；Next/React/地圖套件由抽出的既有 UI package 保留，不因 memory 功能再引入第二套地圖 library。

~~~json
{
  "type": "module",
  "engines": {
    "node": ">=22.13.0"
  },
  "scripts": {
    "dev:mastra": "mastra dev",
    "build:mastra": "mastra build",
    "start:mastra": "mastra start",
    "setup:indices": "tsx src/scripts/setup-indices.ts",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@ai-sdk/provider": "2.0.3",
    "@elastic/elasticsearch": "9.5.0",
    "@mastra/core": "1.60.0",
    "@mastra/elasticsearch": "1.3.1",
    "@mastra/libsql": "1.21.0",
    "@mastra/memory": "1.27.0",
    "@mastra/observability": "1.17.1",
    "dotenv": "17.4.2",
    "zod": "3.25.76"
  },
  "devDependencies": {
    "@types/node": "22.19.11",
    "mastra": "1.25.1",
    "tsx": "4.23.1",
    "typescript": "5.9.3",
    "vitest": "4.1.11"
  }
}
~~~

UNVERIFIED：上方 @types/node、tsx、typescript 是 2026-08-19 registry 解析後建議 pin，未在 Node 22 環境完成 install/typecheck；真正落地時以產生的 lockfile 與測試結果為準。

"@mastra/rag@2.6.0" 和 "@mastra/client-js@1.41.0" 都是當前套件，但本契約最小路徑不需要它們：domain hybrid recall 直接走 Elasticsearch JS client，UI 走 typed custom route。若日後改成通用 vector RAG tool，再加 "@mastra/rag"；若 UI 改打 Mastra built-in agent endpoint，再加 client-js。
VERIFIED: https://www.npmjs.com/package/@mastra/rag/v/2.6.0
VERIFIED: https://www.npmjs.com/package/@mastra/client-js/v/1.41.0

## 3. 必要環境變數

活動 starter 的必要變數是 ELASTICSEARCH_URL、ELASTICSEARCH_API_KEY、OPENROUTER_API_KEY；easy tier 另有 KNOWLEDGE_INDEX，advanced tier 另有 AGENT_ID 與 decay/fusion knobs。
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/easy-win/.env.example
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/advanced/.env.example

CONTRACT：

~~~dotenv
# Required
ELASTICSEARCH_URL=https://your-project.es.us-east-1.aws.elastic.cloud
ELASTICSEARCH_API_KEY=replace-me
OPENROUTER_API_KEY=replace-me

# Required application identity/config
AGENT_ID=picktrip-hotel-memory
PREFERENCE_INDEX=trip-preferences
MASTRA_BASE_URL=http://localhost:4111

# Serverless default is acceptable. Set explicitly for hosted/self-managed.
MEMORY_INFERENCE_ID=.jina-embeddings-v5-text-small
PREFERENCE_INFERENCE_ID=.jina-embeddings-v5-text-small

# Optional advanced retrieval tuning
MEMORY_DECAY_WINDOW_HOURS=2160
FUSION_STRATEGY=linear
FUSION_BM25_WEIGHT=0.35

# Existing Picktrip hotel/place/map API configuration is inherited unchanged
# from the source app. Do not invent duplicate provider credentials here.
~~~

CONTRACT：若 memory-test 透過既有 Picktrip server/proxy 呼叫 hotel/place/map API，本專案不新增 provider key；若抽出 server module 一起執行，原封不動沿用來源 app 的既有 env names。UNVERIFIED：這份 Mastra/Elastic 研究未盤點來源 app 的 env names，因此不在此臆造名稱。

Elastic JS client接受 base64 API key string；金鑰必須只存在 server。
VERIFIED: https://www.elastic.co/docs/reference/elasticsearch/clients/javascript/connecting

## 4. 建議檔案結構

CONTRACT：

~~~text
memory-test/
├── app/
│   ├── page.tsx                         # hotel search + map + chat only
│   └── api/hotel-chat/route.ts          # optional same-origin proxy to :4111
├── src/
│   ├── components/hotel/
│   │   ├── hotel-search.tsx             # extracted existing Picktrip UI
│   │   ├── hotel-map.tsx                # extracted existing Picktrip map
│   │   └── multi-turn-chat.tsx
│   ├── domain/
│   │   ├── hotel.ts
│   │   ├── map-pin.ts
│   │   └── preference.ts
│   ├── lib/
│   │   ├── elastic.ts
│   │   ├── elastic-embedder.ts
│   │   ├── picktrip-api.ts              # reuse existing hotel/place/map client
│   │   └── pin-reducer.ts
│   ├── mastra/
│   │   ├── agents/hotel-memory-agent.ts
│   │   ├── tools/preference-tools.ts
│   │   ├── tools/hotel-map-tools.ts
│   │   ├── routes/hotel-chat-route.ts
│   │   └── index.ts
│   └── scripts/setup-indices.ts
├── tests/
│   ├── preference-recall.test.ts
│   ├── pin-reducer.test.ts
│   └── hotel-chat.contract.test.ts
├── memory.db                         # ignored
├── .env.example
└── package.json
~~~

Mastra 預設偵測 "src/mastra/index.ts"；"mastra dev" 啟動本地 server/Studio，standalone build 由 "mastra build" 產生 ".mastra/output"，可用 "mastra start" 或 Node 直接執行。
VERIFIED: https://mastra.ai/docs/deployment/mastra-server

## 5. 資料與 API 契約

### 5.1 識別規則

CONTRACT：

- resource = 穩定使用者 ID，例如 "demo-user-001"；不可用瀏覽器隨機 UUID 每次重建。
- thread = 單一聊天 ID；同一次多輪對話固定不變，新對話才建立新 UUID。
- hotel search context = 既有 Picktrip API 在每輪回傳的 destination、viewport、飯店候選與 POI 候選；它是 RequestContext，不寫入 message history，也不複製進 preference index。
- preference event = 使用者明確表達、或模型高信心擷取出的可長期偏好；寫入 Elasticsearch。

Mastra 規定 thread owner/resource 建立後不可改；重用 thread 給不同 resource 會出錯。
VERIFIED: https://mastra.ai/docs/memory/overview

RequestContext 是 request-specific data，與持久 memory 不同；tools 可從 execute 的第二參數讀取 requestContext。
VERIFIED: https://mastra.ai/docs/server/request-context
VERIFIED: https://mastra.ai/reference/tools/create-tool

### 5.2 HTTP request / response

CONTRACT：

~~~ts
export type HotelChatRequest = {
  resourceId: string;
  threadId: string;
  message: string;
  searchContext: {
    destination: string;
    viewport?: { north: number; south: number; east: number; west: number };
    hotels: HotelCandidate[];
    pois: PoiCandidate[];
  };
};

export type HotelChatResponse = {
  threadId: string;
  assistantText: string;
  pinOperations: PinOperation[];
  recommendationReasons: RecommendationReason[];
};

export type PinOperation =
  | { operation: "upsert"; pins: MapPin[] }
  | { operation: "remove"; pinIds: string[] }
  | { operation: "clear"; scope: "ai" };

export type MapPin = {
  id: string; // Picktrip entity type + existing entity ID; stable and deduplicable
  kind: "hotel" | "cafe" | "transit" | "attraction";
  title: string;
  latitude: number;
  longitude: number;
  reason: string;
  preferenceIds: string[];
  score: number;
  source: "picktrip-hotel-api" | "picktrip-place-api" | "picktrip-map-api";
};
~~~

CONTRACT：任何 pin 若沒有既有 Picktrip hotel/place/map API 回傳的 latitude、longitude，不回傳；LLM 只負責選擇與解釋，不能生成座標。

### 5.3 多輪 UI reducer

CONTRACT：每輪 "upsert" 不清空既有 pin；以 stable id 合併。使用者說「移除咖啡廳」時才回 "remove"；新的飯店搜尋可回 "clear" 後再 upsert。

~~~ts
export function reducePins(current: MapPin[], ops: PinOperation[]): MapPin[] {
  const byId = new Map(current.map(pin => [pin.id, pin]));
  for (const op of ops) {
    if (op.operation === "clear") {
      byId.clear();
    } else if (op.operation === "remove") {
      for (const id of op.pinIds) byId.delete(id);
    } else {
      for (const pin of op.pins) byId.set(pin.id, pin);
    }
  }
  return [...byId.values()];
}
~~~

## 6. Elasticsearch index mapping

CONTRACT：Mastra conversation embeddings 由 ElasticSearchVector 自己管理；domain preference 使用獨立 "trip-preferences" index，讓 trace/demo 可以明確看到「過往偏好事件如何影響推薦」。

Elastic "semantic_text" 會在 index 時自動做 inference；Serverless 與 Cloud Hosted 9.4+ 未指定 inference_id 時預設 ".jina-embeddings-v5-text-small"，Cloud Hosted 9.3 預設不同模型。為避免跨環境模型漂移，非 Serverless 必須明確設 PREFERENCE_INFERENCE_ID。
VERIFIED: https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/semantic-text-setup-configuration

~~~ts
// src/scripts/setup-indices.ts
import { Client } from "@elastic/elasticsearch";
import "dotenv/config";

const es = new Client({
  node: process.env.ELASTICSEARCH_URL!,
  auth: { apiKey: process.env.ELASTICSEARCH_API_KEY! },
});

const index = process.env.PREFERENCE_INDEX ?? "trip-preferences";
const inferenceId = process.env.PREFERENCE_INFERENCE_ID || undefined;
const semanticField = inferenceId
  ? { type: "semantic_text" as const, inference_id: inferenceId }
  : { type: "semantic_text" as const };

if (!(await es.indices.exists({ index }))) {
  await es.indices.create({
    index,
    mappings: {
      properties: {
        preference_id: { type: "keyword" },
        resource_id: { type: "keyword" },
        thread_id: { type: "keyword" },
        category: { type: "keyword" },
        polarity: { type: "keyword" },
        statement: { type: "text" },
        statement_semantic: semanticField,
        confidence: { type: "float" },
        tags: { type: "keyword" },
        destination: { type: "keyword" },
        location: { type: "geo_point" },
        status: { type: "keyword" },
        supersedes_id: { type: "keyword" },
        source_message_id: { type: "keyword" },
        created_at: { type: "date" },
        updated_at: { type: "date" }
      }
    }
  });
}
~~~

活動 advanced starter 的 typed memory mapping 使用 keyword/text/semantic_text/date，並以 "refresh: wait_for" 讓剛寫入的記憶能立即 recall；本 mapping 復用該 pattern，再加 resource 與 destination 隔離。
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/advanced/src/setup-indices.ts
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/advanced/src/mastra/tools/memory-tools.ts

## 7. Mastra Memory：多輪與跨 thread 偏好

ElasticSearchVector constructor 支援 "id + url + auth.apiKey"；Mastra semantic recall 需要 vector 與 embedder。
VERIFIED: https://mastra.ai/reference/vectors/elasticsearch
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/easy-win/src/mastra/agents/memory-agent.ts

~~~ts
// src/mastra/memory.ts
import { Client } from "@elastic/elasticsearch";
import { ElasticSearchVector } from "@mastra/elasticsearch";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { createElasticEmbedder } from "../lib/elastic-embedder";

const es = new Client({
  node: process.env.ELASTICSEARCH_URL!,
  auth: { apiKey: process.env.ELASTICSEARCH_API_KEY! },
});

export const hotelMemory = new Memory({
  storage: new LibSQLStore({
    id: "hotel-memory-storage",
    url: "file:./memory.db",
  }),
  vector: new ElasticSearchVector({
    id: "hotel-memory-vector",
    url: process.env.ELASTICSEARCH_URL!,
    auth: { apiKey: process.env.ELASTICSEARCH_API_KEY! },
  }),
  embedder: createElasticEmbedder(
    es,
    process.env.MEMORY_INFERENCE_ID ?? ".jina-embeddings-v5-text-small",
  ),
  options: {
    lastMessages: 20,
    semanticRecall: {
      topK: 6,
      messageRange: 2,
      scope: "resource",
    },
    workingMemory: {
      enabled: true,
      scope: "resource",
      template: [
        "# Hotel preference profile",
        "- Preferred neighborhoods:",
        "- Transit priorities:",
        "- Cafe / food priorities:",
        "- Budget and room constraints:",
        "- Avoidances:",
        "- Current trip context:",
      ].join("\n"),
    },
  },
});
~~~

CONTRACT：完整的 "createElasticEmbedder" 直接複製 starter 該檔；因為它明確實作 EmbeddingModelV2 並呼叫 "es.inference.textEmbedding"，不要自行改成過時 provider API。
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/easy-win/src/mastra/elastic-embedder.ts

目前 agent 呼叫必須使用：

~~~ts
await agent.generate(message, {
  memory: {
    resource: resourceId,
    thread: threadId,
  },
});
~~~

VERIFIED: https://mastra.ai/docs/memory/overview

UNVERIFIED：舊文章仍可搜尋到 top-level "resourceId/threadId" 範例，但它不是本契約 API；若 copy 舊 blog code，TypeScript 應視為 migration error。

## 8. 偏好寫入與 hybrid recall tool

Mastra "createTool" 的現行 execute signature 是第一參數為 schema 驗證後 input、第二參數為含 requestContext/abortSignal 的 execution context。
VERIFIED: https://mastra.ai/reference/tools/create-tool

CONTRACT：resourceId 不放進 tool input，避免模型選擇或竄改使用者身份；由 trusted RequestContext 讀取。tool 必須定義 requestContextSchema。

~~~ts
// src/mastra/tools/preference-tools.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { es } from "../../lib/elastic";

const requestContextSchema = z.object({
  resourceId: z.string(),
  threadId: z.string(),
});

export const rememberPreference = createTool({
  id: "remember-preference",
  description: "Persist a durable hotel or trip preference stated by the user.",
  inputSchema: z.object({
    category: z.enum(["transit", "cafe", "food", "budget", "room", "neighborhood", "avoid"]),
    polarity: z.enum(["prefer", "require", "avoid"]),
    statement: z.string().min(3),
    confidence: z.number().min(0).max(1),
    tags: z.array(z.string()).default([]),
    destination: z.string().optional(),
    supersedesId: z.string().optional(),
  }),
  outputSchema: z.object({ preferenceId: z.string() }),
  requestContextSchema,
  execute: async (input, context) => {
    const resourceId = context.requestContext!.get("resourceId");
    const threadId = context.requestContext!.get("threadId");
    const preferenceId = crypto.randomUUID();
    const now = new Date().toISOString();

    await es.index({
      index: process.env.PREFERENCE_INDEX ?? "trip-preferences",
      id: preferenceId,
      document: {
        preference_id: preferenceId,
        resource_id: resourceId,
        thread_id: threadId,
        category: input.category,
        polarity: input.polarity,
        statement: input.statement,
        statement_semantic: input.statement,
        confidence: input.confidence,
        tags: input.tags,
        destination: input.destination,
        status: "active",
        supersedes_id: input.supersedesId,
        created_at: now,
        updated_at: now,
      },
      refresh: "wait_for",
    });
    return { preferenceId };
  },
});
~~~

### Hybrid recall query

Elastic 官方說 FORK + FUSE 可合併 lexical 與 semantic branch；FUSE 預設 RRF，也支援 LINEAR weights 與 minmax normalization。每個 FORK branch 應明確 LIMIT，FUSE 後要自行 SORT。
VERIFIED: https://www.elastic.co/docs/reference/query-languages/esql/commands/fork
VERIFIED: https://www.elastic.co/docs/reference/query-languages/esql/commands/fuse

Elastic 官方支援 ES|QL "params"，並明確指出它可避免把 untrusted user input 插入 query 造成 injection；因此不沿用 starter 的字串 escape 拼接。
VERIFIED: https://www.elastic.co/docs/reference/query-languages/esql/esql-rest

CONTRACT：

~~~ts
const query = [
  "FROM " + index + " METADATA _id, _index, _score",
  "| WHERE resource_id == ?resourceId AND status == \"active\"",
  "| FORK (",
  "    WHERE MATCH(statement, ?query)",
  "    | SORT _score DESC | LIMIT 50",
  "  ) (",
  "    WHERE MATCH(statement_semantic, ?query)",
  "    | SORT _score DESC | LIMIT 50",
  "  )",
  "| FUSE LINEAR WITH { \"weights\": { \"fork1\": 0.35, \"fork2\": 0.65 }, \"normalizer\": \"minmax\" }",
  "| SORT _score DESC | LIMIT 20",
  "| KEEP preference_id, category, polarity, statement, confidence, tags, destination, created_at, _score",
].join("\n");

const result = await es.esql.query({
  query,
  params: [
    { resourceId },
    { query: searchText },
  ],
  format: "json",
});
~~~

UNVERIFIED：同一個 named parameter 在兩個 MATCH 出現時是否只需提供一次，雖符合 ES|QL named parameter 文件，仍須在目標 Serverless project 跑 integration test；若部署拒絕，改用三個 positional "?" 與 [resourceId, searchText, searchText]。

## 9. 可選 time decay

Elastic 官方版本表顯示 FUSE 自 9.2、DECAY 自 9.3；DECAY 在 Stack 9.3+ 與 Serverless 仍標示 Preview。
VERIFIED: https://www.elastic.co/docs/solutions/search/esql-for-search
VERIFIED: https://www.elastic.co/docs/reference/query-languages/esql/functions-operators/search-functions/decay

CONTRACT：MVP 預設先不啟用 DECAY；基礎 recall 通過後才在支援 9.3+ 的 target cluster 開啟 advanced demo。若版本或權限不支援，停用 DECAY，不讓整個 recall 失敗。

~~~text
| EVAL recency = DECAY(
    created_at,
    NOW(),
    2160 hours,
    {"decay": 0.5, "type": "exponential"}
  )
| EVAL final_score = _score * (0.65 + 0.35 * recency) * confidence
| SORT final_score DESC
~~~

Elastic 官方將第三參數定義為 scale（到該距離時回傳 decay 值），date scale 必須是 time_duration；顯式指定 "decay: 0.5" 才可把 2160 hours 清楚解釋為半衰尺度。
VERIFIED: https://www.elastic.co/docs/reference/query-languages/esql/functions-operators/search-functions/decay

活動 advanced starter 使用 "DECAY(created_at, NOW(), hours)"、FORK、FUSE，並把日期 knob 稱為 half-life；本契約改成顯式 options，避免依賴未明寫的 default。
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/advanced/src/mastra/tools/memory-tools.ts

## 10. 飯店／地圖工具與 agent

CONTRACT："personalizeHotelMap" 一次完成 recall + existing Picktrip API orchestration + deterministic ranking + typed pins。飯店與 POI 候選必須來自既有 Picktrip hotel/place/map API：UI 搜尋流程已取得的候選放進 RequestContext；偏好需要額外 POI 時，由 tool 內的薄 port 呼叫既有 Picktrip API。模型只提供本輪 query；destination、viewport、候選與使用者身份都從 trusted RequestContext 讀取，不能改由 Elasticsearch 搜 inventory。

CONTRACT：建立薄的 "PicktripMapDataPort" 只是把來源 app 的既有 API client 暴露給 Mastra tool，不是新 provider integration。exact source module/function name 必須在抽取來源 app 時對齊，現在為 UNVERIFIED。

~~~ts
export interface PicktripMapDataPort {
  searchNearby(input: {
    destination: string;
    viewport?: { north: number; south: number; east: number; west: number };
    kinds: Array<"cafe" | "transit" | "attraction">;
  }): Promise<PoiCandidate[]>;
}
~~~

~~~ts
export const personalizeHotelMap = createTool({
  id: "personalize-hotel-map",
  description: "Recall this user's preferences, rank current hotels and nearby POIs, and return map pin operations.",
  inputSchema: z.object({
    query: z.string(),
  }),
  outputSchema: z.object({
    operations: z.array(PinOperationSchema),
    reasons: z.array(RecommendationReasonSchema),
  }),
  requestContextSchema: z.object({
    resourceId: z.string(),
    threadId: z.string(),
    destination: z.string(),
    viewport: z.object({
      north: z.number(), south: z.number(), east: z.number(), west: z.number(),
    }).optional(),
    hotels: z.array(HotelCandidateSchema),
    pois: z.array(PoiCandidateSchema),
  }),
  execute: async ({ query }, context) => {
    const resourceId = context.requestContext!.get("resourceId");
    const destination = context.requestContext!.get("destination");
    const viewport = context.requestContext!.get("viewport");
    const hotels = context.requestContext!.get("hotels");
    const currentPois = context.requestContext!.get("pois");
    const preferences = await recallPreferences({
      resourceId,
      query,
      destination,
    });
    const kinds = poiKindsRequiredBy(preferences);
    const fetchedPois = kinds.length
      ? await picktripMapData.searchNearby({ destination, viewport, kinds })
      : [];
    const pois = mergePicktripPois(currentPois, fetchedPois);
    return rankAndBuildPins({
      hotels,
      pois,
      preferences,
    });
  },
});
~~~

CONTRACT：ranking 不由 LLM 自由打分；第一版用明確規則：

- transit 偏好：用候選中的 walkingMinutesToTransit 正規化。
- cafe 偏好：用 within10MinCafeCount 或 walkingMinutesToCafe。
- budget：先硬 filter 超出上限，再排序。
- avoid：對標籤命中者扣分或剔除。
- 最終分數與 preferenceIds 一起進 MapPin，UI 才能顯示「因為你常問咖啡廳／交通」。

UNVERIFIED：既有 Picktrip hotel API response 是否已提供上述 transit/cafe feature 與 verified coordinates。若 hotel response 欄位不足，CONTRACT：透過既有 Picktrip place/map API 補足 POI 與距離資料；不另建搜尋 index。測試 fixture 只能出現在 unit/contract tests，runtime pin 的 source 仍必須是 Picktrip API。

### Agent 與 Mastra registry

Agent 以 "tools" object 註冊工具；Mastra instance 以 "agents" object 註冊 agent。註冊後用 Mastra instance 取 agent，才能取得 instance-level storage/logging/registry。
VERIFIED: https://mastra.ai/docs/agents/overview
VERIFIED: https://mastra.ai/docs/agents/tools

~~~ts
// src/mastra/agents/hotel-memory-agent.ts
import { Agent } from "@mastra/core/agent";
import { hotelMemory } from "../memory";
import { rememberPreference } from "../tools/preference-tools";
import { personalizeHotelMap } from "../tools/hotel-map-tools";

export const hotelMemoryAgent = new Agent({
  id: "hotel-memory-agent",
  name: "Hotel Memory Agent",
  instructions: [
    "You are Picktrip's hotel advisor.",
    "Maintain a natural multi-turn conversation.",
    "When the user states a durable preference, call rememberPreference.",
    "For every hotel/map recommendation request, call personalizeHotelMap.",
    "Never invent hotels, POIs, coordinates, prices, or walking times.",
    "Explain recommendations using returned preference IDs and facts.",
  ].join("\n"),
  model: [{
    model: "openrouter/anthropic/claude-sonnet-4.6",
    modelSettings: { maxOutputTokens: 4096 },
  }],
  memory: hotelMemory,
  tools: { rememberPreference, personalizeHotelMap },
});
~~~

Starter 於 2026-08-19 使用同一個 OpenRouter model string 與 maxOutputTokens 4096。
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/easy-win/src/mastra/agents/memory-agent.ts

~~~ts
// src/mastra/index.ts
import { Mastra } from "@mastra/core";
import { Observability, MastraStorageExporter } from "@mastra/observability";
import { hotelMemoryAgent } from "./agents/hotel-memory-agent";
import { hotelChatRoute } from "./routes/hotel-chat-route";

export const mastra = new Mastra({
  agents: { hotelMemoryAgent },
  server: { apiRoutes: [hotelChatRoute] },
  observability: new Observability({
    configs: {
      default: {
        serviceName: "picktrip-hotel-memory",
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
});
~~~

活動 starter 用 Observability + MastraStorageExporter 讓 Studio 顯示 LLM/tool traces。
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/easy-win/src/mastra/index.ts

## 11. Custom route：直接回傳 pins

Mastra custom route 使用 "registerApiRoute" from "@mastra/core/server"，handler 可從 Hono context 取得 Mastra instance；custom route 路徑不能以預設保留 prefix "/api" 開頭。
VERIFIED: https://mastra.ai/docs/server/custom-api-routes
VERIFIED: https://mastra.ai/reference/server/register-api-route

CONTRACT：使用 "/hotel-chat"，不是 "/api/hotel-chat"。以 per-execution "afterToolCall" 收集 typed pin output，避免依賴 FullOutput 內部 toolResults shape。

Mastra 支援 agent-level 或單次 generate/stream 的 beforeToolCall/afterToolCall hook；afterToolCall 可取得 toolName/output/error。
VERIFIED: https://mastra.ai/docs/agents/tools

~~~ts
// src/mastra/routes/hotel-chat-route.ts
import { RequestContext } from "@mastra/core/request-context";
import { registerApiRoute } from "@mastra/core/server";

export const hotelChatRoute = registerApiRoute("/hotel-chat", {
  method: "POST",
  handler: async c => {
    const body = HotelChatRequestSchema.parse(await c.req.json());
    const requestContext = new RequestContext();
    requestContext.set("resourceId", body.resourceId);
    requestContext.set("threadId", body.threadId);
    requestContext.set("destination", body.searchContext.destination);
    requestContext.set("viewport", body.searchContext.viewport);
    requestContext.set("hotels", body.searchContext.hotels);
    requestContext.set("pois", body.searchContext.pois);

    const pinOperations: PinOperation[] = [];
    const recommendationReasons: RecommendationReason[] = [];
    const agent = c.get("mastra").getAgent("hotel-memory-agent");

    const result = await agent.generate(body.message, {
      memory: {
        resource: body.resourceId,
        thread: body.threadId,
      },
      requestContext,
      maxSteps: 8,
      hooks: {
        afterToolCall: ({ toolName, output, error }) => {
          if (!error && toolName === "personalizeHotelMap") {
            const parsed = PersonalizeHotelMapOutputSchema.parse(output);
            pinOperations.push(...parsed.operations);
            recommendationReasons.push(...parsed.reasons);
          }
        },
      },
    });

    return c.json({
      threadId: body.threadId,
      assistantText: result.text,
      pinOperations,
      recommendationReasons,
    });
  },
});
~~~

UNVERIFIED：上面 RequestContext 使用無型別 set 的 exact TypeScript inference；落地時應建立 "HotelRequestContext" type parameter，並以 Node 22 跑 typecheck。此 snippet 的 Mastra API shape 已由現行 docs 驗證，但尚未在此研究環境 compile。

### 可選 client-js 路徑

若不用 custom route，現行 client-js 形狀是：

~~~ts
const client = new MastraClient({ baseUrl: "http://localhost:4111" });
const agent = client.getAgent("hotel-memory-agent");
const result = await agent.generate(
  [{ role: "user", content: message }],
  { memory: { resource: resourceId, thread: threadId } },
);
~~~

VERIFIED: https://github.com/mastra-ai/mastra/blob/main/client-sdks/client-js/README.md
VERIFIED: https://mastra.ai/docs/memory/overview

CONTRACT：本專案仍選 custom route，因為它能直接回傳 domain-level pinOperations，UI 不必理解 Mastra stream/tool event protocol。

## 12. Runnable scripts 與 smoke tests

活動 starter 的 runnable flow 是 install → setup/ingest → "npm run dev" → http://localhost:4111 Studio；advanced flow另有 "npm run setup" 與 seeds。
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/easy-win/README.md
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/starter-projects/advanced/README.md

CONTRACT：實作後標準指令：

~~~bash
node --version                    # must be >= 22.13.0
npm install
cp .env.example .env
npm run setup:indices
npm run dev:mastra               # Studio/server on 4111
npm run dev:web                  # Next UI on 3000, in another terminal
npm run typecheck
npm test
~~~

CONTRACT：上方最小 package.json 只列 Mastra/Elastic backend；"dev:web" 應沿用／映射來源 Picktrip app 的既有 Next 開發 script，不為 memory 功能新增第二套 web build。

CONTRACT：最低 smoke acceptance：

1. 同 resource + 同 thread：第一輪「我很重視車站」；第二輪「幫我看東京飯店」能讀到第一輪。
2. 同 resource + 新 thread：仍可由 resource-scoped working memory / semantic recall 找到交通偏好。
3. 另一 resource：不可看到前一使用者偏好。
4. 第一輪回飯店 pin；第二輪新增「也想要咖啡廳」後，pin reducer 保留飯店並 upsert cafe pins。
5. pin 全部能追到既有 Picktrip hotel/place/map API candidate 與 entity ID，沒有模型生成座標。
6. Elasticsearch "trip-preferences" 有 resource_id、statement_semantic、created_at。
7. Studio trace 可看到 rememberPreference、personalizeHotelMap 以及 memory recall。
8. 若開 decay：使用者新偏好能壓過較舊且衝突的偏好；若關 decay，結果差異可重現。

Mastra Studio traces 可顯示 memory context 與 tool calls；活動 README 明確要求 demo 開 trace。
VERIFIED: https://mastra.ai/docs/memory/overview
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/README.md

## 13. Starter license 與 copy 條件

活動 starter repo 是 MIT License，copyright 2026 JD Armada；license 要求 copies 或 substantial portions 保留 copyright notice 與 permission notice。若直接複製 memory-agent、elastic-embedder、advanced memory tools 或 mapping 的 substantial portion，CONTRACT：在 memory-test 根目錄保留該 LICENSE，並在 NOTICE 註明來源與修改。
VERIFIED: https://github.com/jdarmada/agent-memory-hacknight/blob/e288680f7988091a66a0c77e45c1a7d51154a5d1/LICENSE

UNVERIFIED：什麼程度構成 "substantial portion" 是法律判斷；此文件不是法律意見。最安全的工程做法仍是保留完整 MIT notice。

## 14. 已知風險／實作前待驗

1. UNVERIFIED：目前機器 Node 20.17.0，尚未對 exact pins 執行 npm install、typecheck 或 runtime smoke；先升 Node。
2. UNVERIFIED：目標 Elasticsearch project 的實際版本、DECAY/FUSE availability、Inference endpoint 名稱與權限尚未查 cluster。
3. UNVERIFIED：".jina-embeddings-v5-text-small" 是否在目標 project 可直接呼叫；Serverless/Hosted 版本不同會影響 default。
4. UNVERIFIED：既有 Picktrip hotel/place/map response 的確切欄位名稱，以及是否已有 cafe/transit features 與 verified coordinates；整合時需以來源 app type/schema 對齊。
5. UNVERIFIED：多輪 route snippet 的 RequestContext generics 與 named ES|QL params 尚未在 Node 22 compile/integration test。
6. UNVERIFIED：OpenRouter 活動 key 是否仍有額度；starter README 指出 402 可能表現成 Studio spinner。
7. VERIFIED：DECAY 在 9.3+ / Serverless 仍標 Preview，所以 production fallback 必須存在。https://www.elastic.co/docs/reference/query-languages/esql/functions-operators/search-functions/decay

## 15. 實作順序

CONTRACT：

1. 升 Node 22.13+，以 exact package versions 產生 lockfile。
2. 複製 starter 的 elastic-embedder pattern，先讓同 thread 多輪 memory 在 Studio 通。
3. 建 "trip-preferences" index 與 remember/recall integration tests。
4. 從來源 app 復用既有 Picktrip hotel/place/map API client 與 type；以其 live response 完成 deterministic ranking 與 typed pinOperations。
5. 抽出既有飯店搜尋／地圖 UI，串 custom route，完成多輪 pin reducer。
6. 以 test-only fixture 覆蓋排序與 reducer 邊界，但 runtime data source 固定為既有 Picktrip API。
7. 最後才打開 DECAY，做新舊偏好 reversal demo。

這個順序可先取得完整「Mastra 多輪 + Elasticsearch 記憶 + 地圖 pin」垂直切片，再加 time decay；不把 Studio 當最終 UI，但保留 Studio 作為評審可驗證的 trace 證據。
