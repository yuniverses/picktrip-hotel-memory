import { describe, expect, it, vi } from "vitest";
import { createPicktripHistoryClient } from "@/src/lib/picktrip/history-client";

describe("Picktrip history client", () => {
  it("normalizes list and detail responses while keeping upstream message identity and time", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            conversations: [
              { id: "conversation-1" },
              { conversationId: "conversation-2" },
              { title: "missing id" },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            messages: [
              {
                messageId: "message-1",
                conversationId: "conversation-1",
                role: "USER",
                content: "I need a quiet room",
                createdAt: "2026-08-18T04:05:06.000Z",
              },
              {
                id: "message-2",
                role: "assistant",
                content: "Here are some options",
                created_at: "2026-08-18T04:05:07.000Z",
              },
            ],
          },
        }),
      );
    const client = createPicktripHistoryClient("picktrip-token", fetcher, "https://api.test/");

    const conversations = await client.listConversations(100);
    const messages = await client.getConversationMessages("conversation-1");

    expect(conversations).toEqual([
      { conversationId: "conversation-1" },
      { conversationId: "conversation-2" },
    ]);
    expect(messages).toEqual([
      {
        messageId: "message-1",
        conversationId: "conversation-1",
        role: "user",
        content: "I need a quiet room",
        createdAt: "2026-08-18T04:05:06.000Z",
      },
      {
        messageId: "message-2",
        conversationId: "conversation-1",
        role: "assistant",
        content: "Here are some options",
        createdAt: "2026-08-18T04:05:07.000Z",
      },
    ]);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://api.test/agent/conversations/display-history?limit=100",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer picktrip-token" }),
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://api.test/agent/conversations/conversation-1/display-history",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer picktrip-token" }),
      }),
    );
  });

  it("caps list requests at 100 and reports upstream failures", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    const client = createPicktripHistoryClient("token", fetcher, "https://api.test");

    await expect(client.listConversations(500)).rejects.toThrow("503");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.test/agent/conversations/display-history?limit=100",
      expect.anything(),
    );
  });
});
