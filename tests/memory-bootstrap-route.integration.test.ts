import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/memory/bootstrap/route";
import { createPicktripHistoryClient } from "@/src/lib/picktrip/history-client";
import { verifyPicktripToken } from "@/src/lib/picktrip/session";
import { bootstrapHistoryMemory } from "@/src/server/history-memory-bootstrap";

const mocks = vi.hoisted(() => ({
  historyClient: { listConversations: vi.fn(), getConversationMessages: vi.fn() },
  preferenceStore: { rememberMany: vi.fn() },
}));

vi.mock("@/src/lib/picktrip/session", () => ({ verifyPicktripToken: vi.fn() }));
vi.mock("@/src/lib/picktrip/history-client", () => ({
  createPicktripHistoryClient: vi.fn(() => mocks.historyClient),
}));
vi.mock("@/src/lib/elastic/client", () => ({ getElasticClient: vi.fn(() => ({})) }));
vi.mock("@/src/lib/elastic/preference-store", () => ({
  ElasticPreferenceStore: vi.fn(function MockPreferenceStore() {
    return mocks.preferenceStore;
  }),
}));
vi.mock("@/src/server/history-memory-bootstrap", () => ({ bootstrapHistoryMemory: vi.fn() }));

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/memory/bootstrap", () => {
  it("requires the secure Picktrip cookie", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/memory/bootstrap", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    expect(verifyPicktripToken).not.toHaveBeenCalled();
    expect(bootstrapHistoryMemory).not.toHaveBeenCalled();
  });

  it("uses the verified identity and cannot be spoofed through request JSON", async () => {
    vi.mocked(verifyPicktripToken).mockResolvedValue({
      uid: "trusted-user",
      name: "Ada",
      imageUrl: null,
    });
    vi.mocked(bootstrapHistoryMemory).mockResolvedValue({
      status: "partial",
      conversationsFound: 3,
      conversationsImported: 2,
      detailFailures: 1,
      userMessagesScanned: 4,
      assistantMessagesSkipped: 3,
      preferencesWritten: 2,
    });
    const request = new NextRequest("http://localhost/api/memory/bootstrap", {
      method: "POST",
      headers: {
        Cookie: "picktrip_token=trusted-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ resourceId: "attacker-selected-user" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(verifyPicktripToken).toHaveBeenCalledWith("trusted-token");
    expect(createPicktripHistoryClient).toHaveBeenCalledWith("trusted-token");
    expect(bootstrapHistoryMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: "trusted-user",
        historyClient: mocks.historyClient,
        preferenceStore: mocks.preferenceStore,
      }),
    );
    await expect(response.json()).resolves.toEqual({
      status: "partial",
      conversationsFound: 3,
      conversationsImported: 2,
      detailFailures: 1,
      userMessagesScanned: 4,
      assistantMessagesSkipped: 3,
      preferencesWritten: 2,
    });
  });
});
