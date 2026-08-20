import { describe, expect, it, vi } from "vitest";
import type { ExtractedPreference } from "@/src/domain/preference-extraction";
import { bootstrapHistoryMemory } from "@/src/server/history-memory-bootstrap";

const cafePreference: ExtractedPreference = {
  category: "cafe",
  polarity: "prefer",
  statement: "I care about coffee shops",
  confidence: 0.92,
  tags: ["cafe"],
};

describe("history memory bootstrap", () => {
  it("extracts every user message, excludes assistants, and preserves source identity and time", async () => {
    const historyClient = {
      listConversations: vi.fn().mockResolvedValue([{ conversationId: "conversation-1" }]),
      getConversationMessages: vi.fn().mockResolvedValue([
        {
          messageId: "user-message-1",
          conversationId: "conversation-1",
          role: "user",
          content: "No keyword prefilter should skip this",
          createdAt: "2026-08-17T01:02:03.000Z",
        },
        {
          messageId: "assistant-message-1",
          conversationId: "conversation-1",
          role: "assistant",
          content: "Coffee shops are nearby",
          createdAt: "2026-08-17T01:02:04.000Z",
        },
      ]),
    };
    const extractPreferences = vi.fn().mockReturnValue([cafePreference]);
    const rememberMany = vi.fn().mockResolvedValue(["preference-1"]);

    const result = await bootstrapHistoryMemory({
      resourceId: "trusted-user",
      historyClient,
      preferenceStore: { rememberMany },
      extractPreferences,
    });

    expect(extractPreferences).toHaveBeenCalledTimes(1);
    expect(extractPreferences).toHaveBeenCalledWith("No keyword prefilter should skip this");
    expect(rememberMany).toHaveBeenCalledWith([
      expect.objectContaining({
        resourceId: "trusted-user",
        threadId: "conversation-1",
        sourceMessageId: "user-message-1",
        createdAt: "2026-08-17T01:02:03.000Z",
        category: "cafe",
      }),
    ]);
    expect(result).toEqual({
      status: "completed",
      conversationsFound: 1,
      conversationsImported: 1,
      detailFailures: 0,
      userMessagesScanned: 1,
      assistantMessagesSkipped: 1,
      preferencesWritten: 1,
    });
  });

  it("continues after individual conversation detail failures", async () => {
    const historyClient = {
      listConversations: vi
        .fn()
        .mockResolvedValue([{ conversationId: "broken" }, { conversationId: "healthy" }]),
      getConversationMessages: vi.fn(async (conversationId: string) => {
        if (conversationId === "broken") throw new Error("upstream timeout");
        return [
          {
            messageId: "message-2",
            conversationId,
            role: "user" as const,
            content: "I need a station",
            createdAt: "2026-08-18T01:00:00.000Z",
          },
        ];
      }),
    };
    const rememberMany = vi.fn().mockResolvedValue(["preference-2"]);

    const result = await bootstrapHistoryMemory({
      resourceId: "trusted-user",
      historyClient,
      preferenceStore: { rememberMany },
    });

    expect(result.status).toBe("partial");
    expect(result.detailFailures).toBe(1);
    expect(result.conversationsImported).toBe(1);
    expect(result.preferencesWritten).toBe(1);
  });

  it("limits simultaneous conversation-detail reads to four", async () => {
    const conversations = Array.from({ length: 12 }, (_, index) => ({
      conversationId: `conversation-${index}`,
    }));
    let active = 0;
    let maximumActive = 0;
    const historyClient = {
      listConversations: vi.fn().mockResolvedValue(conversations),
      getConversationMessages: vi.fn(async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
        return [];
      }),
    };

    await bootstrapHistoryMemory({
      resourceId: "trusted-user",
      historyClient,
      preferenceStore: { rememberMany: vi.fn().mockResolvedValue([]) },
    });

    expect(maximumActive).toBe(4);
  });
});
