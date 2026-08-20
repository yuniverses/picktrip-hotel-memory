import { createHash } from "node:crypto";
import type { Client } from "@elastic/elasticsearch";
import type { PreferenceCategory } from "@/src/domain/preference-extraction";
import type { RecalledPreference } from "@/src/domain/schemas";

export type RememberPreferenceInput = {
  resourceId: string;
  threadId: string;
  category: PreferenceCategory;
  polarity: "prefer" | "require" | "avoid";
  statement: string;
  confidence: number;
  tags: string[];
  destination?: string;
  sourceMessageId?: string;
  createdAt?: string;
};

export class ElasticPreferenceStore {
  constructor(
    private readonly client: Client,
    private readonly indexName = process.env.PREFERENCE_INDEX_ALIAS ??
      process.env.PREFERENCE_INDEX ??
      "picktrip-memory-preferences",
  ) {}

  async remember(input: RememberPreferenceInput): Promise<string> {
    const preferenceId = preferenceIdFor(input);
    const now = new Date().toISOString();
    await this.client.index({
      index: this.indexName,
      id: preferenceId,
      document: preferenceDocument(input, preferenceId, now),
      refresh: "wait_for",
    });
    return preferenceId;
  }

  async rememberMany(inputs: RememberPreferenceInput[]): Promise<string[]> {
    if (inputs.length === 0) return [];
    const now = new Date().toISOString();
    const ids = inputs.map(preferenceIdFor);
    const operations = inputs.flatMap((input, index) => {
      const preferenceId = ids[index] as string;
      return [
        { index: { _index: this.indexName, _id: preferenceId } },
        preferenceDocument(input, preferenceId, now),
      ];
    });
    const result = await this.client.bulk({ operations, refresh: "wait_for" });
    if (result.errors) {
      throw new Error("Elasticsearch preference bulk indexing failed");
    }
    return ids;
  }

  async recall(input: {
    resourceId: string;
    searchText: string;
    destination?: string;
  }): Promise<RecalledPreference[]> {
    const result = await this.client.esql.query({
      query: [
        `FROM ${this.indexName} METADATA _id, _index, _score`,
        '| WHERE resource_id == ?resourceId AND status == "active"',
        "| FORK (WHERE MATCH(statement, ?query) | SORT _score DESC | LIMIT 30)",
        "       (WHERE MATCH(statement_semantic, ?query) | SORT _score DESC | LIMIT 30)",
        '| FUSE LINEAR WITH { "weights": { "fork1": 0.35, "fork2": 0.65 }, "normalizer": "minmax" }',
        "| SORT _score DESC | LIMIT 12",
        "| KEEP preference_id, statement, category, confidence, _score",
      ].join("\n"),
      params: [{ resourceId: input.resourceId }, { query: input.searchText }],
      format: "json",
    });
    const columns = (result.columns ?? []).map((column) => column.name);
    return (result.values ?? []).map((row) => {
      const value = Object.fromEntries(columns.map((column, index) => [column, row[index]]));
      return {
        id: String(value.preference_id),
        statement: String(value.statement),
        category: value.category as RecalledPreference["category"],
        confidence: Number(value.confidence ?? 1),
        score: Number(value._score ?? 0),
      };
    });
  }
}

function preferenceIdFor(input: RememberPreferenceInput): string {
  const identity = input.sourceMessageId
    ? [input.resourceId, input.threadId, input.sourceMessageId, input.category]
    : [input.resourceId, input.category, input.polarity, input.statement.trim().toLowerCase()];
  return createHash("sha256").update(identity.join("\u0000")).digest("hex").slice(0, 32);
}

function preferenceDocument(
  input: RememberPreferenceInput,
  preferenceId: string,
  updatedAt: string,
) {
  return {
    preference_id: preferenceId,
    resource_id: input.resourceId,
    thread_id: input.threadId,
    category: input.category,
    polarity: input.polarity,
    statement: input.statement,
    statement_semantic: input.statement,
    confidence: input.confidence,
    tags: input.tags,
    destination: input.destination,
    status: "active",
    source_message_id: input.sourceMessageId,
    created_at: input.createdAt ?? updatedAt,
    updated_at: updatedAt,
  };
}
