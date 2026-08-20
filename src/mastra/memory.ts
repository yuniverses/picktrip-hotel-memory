import { ElasticSearchVector } from "@mastra/elasticsearch";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { getElasticClient } from "@/src/lib/elastic/client";
import { createElasticEmbedder } from "@/src/lib/elastic/elastic-embedder";

export const hotelStorage = new LibSQLStore({
  id: "picktrip-hotel-memory",
  // Vercel's application bundle is read-only; its per-instance /tmp directory is writable.
  // Durable preference and conversation recall still lives in Elasticsearch.
  url:
    process.env.MASTRA_MEMORY_URL ??
    (process.env.VERCEL ? "file:/tmp/picktrip-memory.db" : "file:./memory.db"),
});
const elasticUrl = process.env.ELASTICSEARCH_URL;
const elasticKey = process.env.ELASTICSEARCH_API_KEY;

export const hotelMemory = new Memory({
  storage: hotelStorage,
  ...(elasticUrl
    ? {
        vector: new ElasticSearchVector({
          id: "mastra-hotel-memory-vector",
          url: elasticUrl,
          ...(elasticKey ? { auth: { apiKey: elasticKey } } : {}),
        }),
        embedder: createElasticEmbedder(
          getElasticClient(),
          process.env.MEMORY_INFERENCE_ID ?? ".jina-embeddings-v5-text-small",
        ),
      }
    : {}),
  options: {
    lastMessages: 20,
    ...(elasticUrl
      ? { semanticRecall: { topK: 6, messageRange: 2, scope: "resource" as const } }
      : {}),
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
