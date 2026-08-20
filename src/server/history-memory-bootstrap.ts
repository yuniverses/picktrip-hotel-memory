import {
  type ExtractedPreference,
  extractExplicitPreferences,
  type PreferenceCategory,
} from "@/src/domain/preference-extraction";
import type {
  ElasticPreferenceStore,
  RememberPreferenceInput,
} from "@/src/lib/elastic/preference-store";
import type { PicktripHistoryClient } from "@/src/lib/picktrip/history-client";

const supportedCategories = new Set<PreferenceCategory>([
  "transit",
  "cafe",
  "food",
  "budget",
  "room",
  "neighborhood",
  "avoid",
]);

export type HistoryBootstrapResult = {
  status: "completed" | "partial";
  conversationsFound: number;
  conversationsImported: number;
  detailFailures: number;
  userMessagesScanned: number;
  assistantMessagesSkipped: number;
  preferencesWritten: number;
};

export async function bootstrapHistoryMemory(input: {
  resourceId: string;
  historyClient: PicktripHistoryClient;
  preferenceStore: Pick<ElasticPreferenceStore, "rememberMany">;
  extractPreferences?: (message: string) => ExtractedPreference[];
  concurrency?: number;
}): Promise<HistoryBootstrapResult> {
  const conversations = await input.historyClient.listConversations(100);
  const preferences: RememberPreferenceInput[] = [];
  const extractPreferences = input.extractPreferences ?? extractExplicitPreferences;
  let conversationsImported = 0;
  let detailFailures = 0;
  let userMessagesScanned = 0;
  let assistantMessagesSkipped = 0;
  let cursor = 0;

  const worker = async () => {
    while (cursor < conversations.length) {
      const conversation = conversations[cursor];
      cursor += 1;
      if (!conversation) continue;
      try {
        const messages = await input.historyClient.getConversationMessages(
          conversation.conversationId,
        );
        conversationsImported += 1;
        for (const message of messages) {
          if (message.role !== "user") {
            assistantMessagesSkipped += 1;
            continue;
          }
          userMessagesScanned += 1;
          const extracted = extractPreferences(message.content);
          for (const preference of extracted) {
            if (!supportedCategories.has(preference.category)) continue;
            preferences.push({
              resourceId: input.resourceId,
              threadId: message.conversationId,
              category: preference.category,
              polarity: preference.polarity,
              statement: preference.statement,
              confidence: preference.confidence,
              tags: preference.tags,
              destination: preference.destination,
              sourceMessageId: message.messageId,
              createdAt: message.createdAt,
            });
          }
        }
      } catch {
        detailFailures += 1;
      }
    }
  };

  const requestedConcurrency = input.concurrency ?? 4;
  const concurrency = Math.min(4, Math.max(1, Math.trunc(requestedConcurrency)));
  await Promise.all(
    Array.from({ length: Math.min(concurrency, conversations.length) }, () => worker()),
  );

  const writtenIds = await input.preferenceStore.rememberMany(preferences);
  return {
    status: detailFailures > 0 ? "partial" : "completed",
    conversationsFound: conversations.length,
    conversationsImported,
    detailFailures,
    userMessagesScanned,
    assistantMessagesSkipped,
    preferencesWritten: writtenIds.length,
  };
}
