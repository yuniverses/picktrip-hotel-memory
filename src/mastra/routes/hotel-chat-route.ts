import { registerApiRoute } from "@mastra/core/server";
import { ZodError } from "zod";
import { tokenFromAuthorization, verifyPicktripToken } from "@/src/lib/picktrip/session";
import { createHotelChatService } from "@/src/server/hotel-chat-service";
import { generateHotelTurn } from "../generate-hotel-turn";

const service = createHotelChatService({
  verifyBearerToken: async (authorization) => {
    const credential = tokenFromAuthorization(authorization);
    const identity = await verifyPicktripToken(credential);
    return { ...identity, credential };
  },
  generate: generateHotelTurn,
});

export const hotelChatRoute = registerApiRoute("/hotel-chat", {
  method: "POST",
  requiresAuth: false,
  handler: async (context) => {
    try {
      const result = await service.handle(
        context.req.header("Authorization") ?? null,
        await context.req.json(),
      );
      return context.json(result);
    } catch (error) {
      if (error instanceof ZodError) {
        return context.json({ error: "Invalid hotel chat request", issues: error.issues }, 400);
      }
      const message = error instanceof Error ? error.message : "Hotel chat failed";
      const status = /Authentication|session|credential/i.test(message) ? 401 : 500;
      return context.json({ error: message }, status);
    }
  },
});
