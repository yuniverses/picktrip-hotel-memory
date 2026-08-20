import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { recalledPreferenceSchema } from "@/src/domain/schemas";
import { getElasticClient } from "@/src/lib/elastic/client";
import { ElasticPreferenceStore } from "@/src/lib/elastic/preference-store";
import { hotelAgentContextSchema, requireValue } from "../context";

export const rememberPreference = createTool({
  id: "remember-preference",
  description: "Persist a durable hotel or travel preference explicitly stated by the user.",
  inputSchema: z.object({
    category: z.enum(["transit", "cafe", "food", "budget", "room", "neighborhood", "avoid"]),
    polarity: z.enum(["prefer", "require", "avoid"]),
    statement: z.string().min(3),
    confidence: z.number().min(0).max(1),
    tags: z.array(z.string()).default([]),
  }),
  outputSchema: z.object({ preferenceId: z.string() }),
  requestContextSchema: hotelAgentContextSchema,
  execute: async (input, execution) => {
    const store = new ElasticPreferenceStore(getElasticClient());
    const preferenceId = await store.remember({
      resourceId: requireValue(execution.requestContext?.get("resourceId"), "resourceId"),
      threadId: requireValue(execution.requestContext?.get("threadId"), "threadId"),
      category: input.category,
      polarity: input.polarity,
      statement: input.statement,
      confidence: input.confidence,
      tags: input.tags,
      destination: requireValue(execution.requestContext?.get("destination"), "destination"),
    });
    return { preferenceId };
  },
});

export const recallPreferences = createTool({
  id: "recall-preferences",
  description: "Recall authenticated user's durable hotel preferences from Elasticsearch.",
  inputSchema: z.object({ query: z.string().min(1) }),
  outputSchema: z.object({ preferences: z.array(recalledPreferenceSchema) }),
  requestContextSchema: hotelAgentContextSchema,
  execute: async ({ query }, execution) => {
    const store = new ElasticPreferenceStore(getElasticClient());
    const preferences = await store.recall({
      resourceId: requireValue(execution.requestContext?.get("resourceId"), "resourceId"),
      searchText: query,
      destination: requireValue(execution.requestContext?.get("destination"), "destination"),
    });
    return { preferences };
  },
});
