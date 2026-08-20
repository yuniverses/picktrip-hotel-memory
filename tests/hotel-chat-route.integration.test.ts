import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/hotel-chat/route";
import { verifyPicktripToken } from "@/src/lib/picktrip/session";
import { generateHotelTurn } from "@/src/mastra/generate-hotel-turn";

vi.mock("@/src/lib/picktrip/session", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/src/lib/picktrip/session")>();
  return { ...original, verifyPicktripToken: vi.fn() };
});

vi.mock("@/src/mastra/generate-hotel-turn", () => ({
  generateHotelTurn: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("POST /api/hotel-chat", () => {
  it("validates the Picktrip session and forwards only the typed body to Mastra", async () => {
    vi.mocked(verifyPicktripToken).mockResolvedValue({
      uid: "trusted-user",
      name: null,
      imageUrl: null,
    });
    const mastraResponse = {
      threadId: "thread-a",
      assistantText: "已更新地圖",
      pinOperations: [],
      recommendationReasons: [],
      recalledPreferences: [],
    };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mastraResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const request = new NextRequest("http://localhost/api/hotel-chat", {
      method: "POST",
      headers: {
        Cookie: "picktrip_token=trusted-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        threadId: "thread-a",
        message: "想住車站附近",
        searchContext: { destination: "Tokyo", hotels: [], pois: [] },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(verifyPicktripToken).toHaveBeenCalledWith("trusted-token");
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:4111/hotel-chat",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer trusted-token" }),
      }),
    );
    await expect(response.json()).resolves.toEqual(mastraResponse);
  });

  it("does not reach Mastra without an authenticated cookie", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const request = new NextRequest("http://localhost/api/hotel-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("runs the Mastra-backed turn inside Vercel with the verified Picktrip identity", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.mocked(verifyPicktripToken).mockResolvedValue({
      uid: "trusted-user",
      name: null,
      imageUrl: null,
    });
    vi.mocked(generateHotelTurn).mockResolvedValue({
      assistantText: "I added two personalized pins.",
      pinOperations: [],
      recommendationReasons: [],
      recalledPreferences: [],
    });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const request = new NextRequest("https://picktrip-hotel-memory.vercel.app/api/hotel-chat", {
      method: "POST",
      headers: {
        Cookie: "picktrip_token=trusted-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        threadId: "thread-a",
        message: "Keep it close to a cafe.",
        searchContext: { destination: "Tokyo", hotels: [], pois: [] },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(generateHotelTurn).toHaveBeenCalledWith({
      threadId: "thread-a",
      message: "Keep it close to a cafe.",
      searchContext: { destination: "Tokyo", hotels: [], pois: [] },
      resourceId: "trusted-user",
      credential: "trusted-token",
    });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      threadId: "thread-a",
      assistantText: "I added two personalized pins.",
    });
  });
});
