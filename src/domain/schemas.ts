import { z } from "zod";

export const coordinateSchema = z.object({ latitude: z.number(), longitude: z.number() });

export const hotelCandidateSchema = z.object({
  hotelId: z.string().min(1),
  name: z.string().min(1),
  nameEn: z.string().default(""),
  starRating: z.number().min(0).max(5).default(0),
  ratingScore: z.number().nullable().default(null),
  reviewCount: z.number().int().nonnegative().default(0),
  categoryName: z.string().default(""),
  primaryImage: z.string().default(""),
  latitude: z.number(),
  longitude: z.number(),
  address: z.string().default(""),
  cityName: z.string().default(""),
  countryCode: z.string().default(""),
  countryName: z.string().default(""),
  destinationName: z.string().default(""),
  highlights: z.array(z.string()).default([]),
  minPriceCache: z
    .object({ amount: z.number().nonnegative(), currency: z.string().length(3) })
    .nullable()
    .default(null),
  siteId: z.string().default(""),
});

export const poiCandidateSchema = z.object({
  placeId: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().nullish(),
  address: z.string().nullish(),
  imageUrl: z.string().url().nullish(),
  latitude: z.number(),
  longitude: z.number(),
  primaryType: z.string().default("other"),
  tags: z.array(z.string()).default([]),
});

export const mapPinSchema = z.object({
  id: z.string().min(1),
  entityId: z.string().min(1),
  kind: z.enum(["hotel", "cafe", "transit", "attraction"]),
  title: z.string().min(1),
  latitude: z.number(),
  longitude: z.number(),
  reason: z.string(),
  preferenceIds: z.array(z.string()),
  score: z.number().min(0).max(1),
  source: z.enum(["picktrip-hotel-api", "picktrip-place-api", "picktrip-map-api"]),
});

export const pinOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("upsert"), pins: z.array(mapPinSchema) }),
  z.object({ operation: z.literal("remove"), pinIds: z.array(z.string()) }),
  z.object({ operation: z.literal("clear"), scope: z.literal("ai") }),
]);

export const recalledPreferenceSchema = z.object({
  id: z.string(),
  statement: z.string(),
  category: z.enum(["transit", "cafe", "food", "budget", "room", "neighborhood", "avoid"]),
  confidence: z.number().default(1),
  score: z.number().default(0),
});

export const recommendationReasonSchema = z.object({
  entityId: z.string(),
  reason: z.string(),
  preferenceIds: z.array(z.string()),
});

export const searchContextSchema = z.object({
  destination: z.string().min(1),
  viewport: z
    .object({ north: z.number(), south: z.number(), east: z.number(), west: z.number() })
    .optional(),
  hotels: z.array(hotelCandidateSchema).max(50),
  pois: z.array(poiCandidateSchema).max(100),
});

export const hotelChatRequestSchema = z
  .object({
    threadId: z.string().min(1),
    message: z.string().trim().min(1).max(4000),
    searchContext: searchContextSchema,
  })
  .strict();

export const hotelChatResponseSchema = z.object({
  threadId: z.string(),
  assistantText: z.string(),
  pinOperations: z.array(pinOperationSchema),
  recommendationReasons: z.array(recommendationReasonSchema),
  recalledPreferences: z.array(recalledPreferenceSchema),
});

export type HotelCandidate = z.infer<typeof hotelCandidateSchema>;
export type PoiCandidate = z.infer<typeof poiCandidateSchema>;
export type MapPin = z.infer<typeof mapPinSchema>;
export type PinOperation = z.infer<typeof pinOperationSchema>;
export type RecalledPreference = z.infer<typeof recalledPreferenceSchema>;
export type RecommendationReason = z.infer<typeof recommendationReasonSchema>;
export type HotelChatRequest = z.infer<typeof hotelChatRequestSchema>;
export type HotelChatResponse = z.infer<typeof hotelChatResponseSchema>;
