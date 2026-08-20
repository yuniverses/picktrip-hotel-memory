import { describe, expect, it, vi } from "vitest";
import { ElasticPreferenceStore } from "@/src/lib/elastic/preference-store";

describe("Elastic preference adapter", () => {
  it("writes authenticated resource partition and recalls only that partition", async () => {
    const index = vi.fn().mockResolvedValue({ result: "created" });
    const query = vi.fn().mockResolvedValue({
      columns: [
        { name: "preference_id" },
        { name: "statement" },
        { name: "category" },
        { name: "confidence" },
        { name: "_score" },
      ],
      values: [["p1", "I prefer stations", "transit", 0.98, 1.2]],
    });
    const store = new ElasticPreferenceStore(
      { index, esql: { query } } as never,
      "trip-preferences",
    );

    await store.remember({
      resourceId: "firebase-user-a",
      threadId: "thread-1",
      category: "transit",
      polarity: "prefer",
      statement: "I prefer stations",
      confidence: 0.98,
      tags: ["station"],
      destination: "Tokyo",
    });
    const recalled = await store.recall({
      resourceId: "firebase-user-a",
      searchText: "Tokyo hotel",
      destination: "Tokyo",
    });

    expect(index).toHaveBeenCalledWith(
      expect.objectContaining({
        document: expect.objectContaining({ resource_id: "firebase-user-a" }),
      }),
    );
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.arrayContaining([{ resourceId: "firebase-user-a" }]),
      }),
    );
    const esql = query.mock.calls[0]?.[0]?.query as string;
    expect(esql).toContain("FROM trip-preferences METADATA _id, _index, _score");
    expect(esql.indexOf("METADATA _id, _index, _score")).toBeLessThan(esql.indexOf("| FUSE"));
    expect(recalled[0]).toMatchObject({ id: "p1", category: "transit" });
  });

  it("bulk-indexes history preferences idempotently by source message and preserves createdAt", async () => {
    const bulk = vi.fn().mockResolvedValue({ errors: false, items: [] });
    const store = new ElasticPreferenceStore({ bulk } as never, "trip-preferences");
    const base = {
      resourceId: "trusted-user",
      threadId: "conversation-1",
      category: "cafe" as const,
      polarity: "prefer" as const,
      statement: "I always look for coffee shops",
      confidence: 0.92,
      tags: ["cafe"],
      sourceMessageId: "message-42",
      createdAt: "2026-08-17T01:02:03.000Z",
    };

    const firstIds = await store.rememberMany([base]);
    const secondIds = await store.rememberMany([{ ...base, statement: "Updated source text" }]);

    expect(secondIds).toEqual(firstIds);
    expect(bulk).toHaveBeenCalledTimes(2);
    expect(bulk.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        refresh: "wait_for",
        operations: [
          { index: { _index: "trip-preferences", _id: firstIds[0] } },
          expect.objectContaining({
            resource_id: "trusted-user",
            source_message_id: "message-42",
            created_at: "2026-08-17T01:02:03.000Z",
          }),
        ],
      }),
    );
  });
});
