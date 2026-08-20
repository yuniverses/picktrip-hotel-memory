import { describe, expect, it } from "vitest";
import { buildIndexDefinitions } from "@/src/lib/elastic/index-definitions";

describe("versioned Elasticsearch index setup", () => {
  it("uses versioned physical indexes behind stable write aliases", () => {
    const definitions = buildIndexDefinitions({
      preferenceAlias: "picktrip-memory-preferences",
      conversationAlias: "picktrip-memory-turns",
      version: "v1",
      inferenceId: ".jina-embeddings-v5-text-small",
    });

    expect(definitions.map((definition) => [definition.physicalName, definition.alias])).toEqual([
      ["picktrip-memory-preferences-v1", "picktrip-memory-preferences"],
      ["picktrip-memory-turns-v1", "picktrip-memory-turns"],
    ]);
    expect(definitions[0].mappings.properties.statement_semantic).toMatchObject({
      type: "semantic_text",
      inference_id: ".jina-embeddings-v5-text-small",
    });
    expect(definitions[1].mappings.properties.resource_id).toEqual({ type: "keyword" });
  });
});
