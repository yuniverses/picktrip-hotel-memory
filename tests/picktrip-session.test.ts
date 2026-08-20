import { describe, expect, it, vi } from "vitest";
import { verifyPicktripToken } from "@/src/lib/picktrip/session";

describe("Picktrip session validation", () => {
  it("uses the upstream current-user response rather than unverified JWT claims", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { userId: "trusted-upstream-user", name: "Ada" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const identity = await verifyPicktripToken(
      "forged.header.payload",
      fetcher,
      "https://api.test",
    );

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.test/app/user/read/me",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer forged.header.payload" }),
      }),
    );
    expect(identity.uid).toBe("trusted-upstream-user");
  });

  it("rejects an expired or invalid token", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));
    await expect(verifyPicktripToken("expired", fetcher, "https://api.test")).rejects.toThrow(
      "Picktrip session is invalid",
    );
  });
});
