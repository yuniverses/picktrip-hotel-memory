import { describe, expect, it, vi } from "vitest";
import { createHotelChatService } from "@/src/server/hotel-chat-service";

const body = {
  threadId: "thread-keep",
  message: "我很在意交通，也喜歡附近有咖啡廳",
  searchContext: { destination: "Tokyo", hotels: [], pois: [] },
};

describe("hotel chat service", () => {
  it("derives resource identity from verified token and rejects client user spoofing", async () => {
    const generate = vi.fn().mockResolvedValue({
      assistantText: "收到",
      pinOperations: [],
      recommendationReasons: [],
      recalledPreferences: [],
    });
    const service = createHotelChatService({
      verifyBearerToken: vi.fn().mockResolvedValue({ uid: "firebase-real-user" }),
      generate,
    });

    await expect(
      service.handle("Bearer valid", { ...body, userId: "attacker" } as never),
    ).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects missing authentication before memory is written", async () => {
    const generate = vi.fn();
    const service = createHotelChatService({
      verifyBearerToken: vi.fn().mockRejectedValue(new Error("unauthenticated")),
      generate,
    });

    await expect(service.handle(null, body)).rejects.toThrow("unauthenticated");
    expect(generate).not.toHaveBeenCalled();
  });

  it("keeps the same authenticated resource and thread across multiple turns", async () => {
    const generate = vi.fn().mockResolvedValue({
      assistantText: "ok",
      pinOperations: [],
      recommendationReasons: [],
      recalledPreferences: [],
    });
    const service = createHotelChatService({
      verifyBearerToken: vi.fn().mockResolvedValue({ uid: "user-a" }),
      generate,
    });

    await service.handle("Bearer token", body);
    await service.handle("Bearer token", { ...body, message: "也幫我標咖啡廳" });

    expect(generate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ resourceId: "user-a", threadId: "thread-keep" }),
    );
  });
});
