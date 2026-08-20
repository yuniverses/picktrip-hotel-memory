import {
  type HotelChatRequest,
  type HotelChatResponse,
  hotelChatRequestSchema,
} from "@/src/domain/schemas";

type VerifiedIdentity = { uid: string; credential?: string };
type GenerateInput = HotelChatRequest & { resourceId: string; credential?: string };

export type HotelChatServiceDependencies = {
  verifyBearerToken: (authorization: string | null) => Promise<VerifiedIdentity>;
  generate: (input: GenerateInput) => Promise<Omit<HotelChatResponse, "threadId">>;
};

export function createHotelChatService(dependencies: HotelChatServiceDependencies) {
  return {
    async handle(authorization: string | null, rawBody: unknown): Promise<HotelChatResponse> {
      const identity = await dependencies.verifyBearerToken(authorization);
      const body = hotelChatRequestSchema.parse(rawBody);
      const result = await dependencies.generate({
        ...body,
        resourceId: identity.uid,
        credential: identity.credential,
      });
      return { threadId: body.threadId, ...result };
    },
  };
}
