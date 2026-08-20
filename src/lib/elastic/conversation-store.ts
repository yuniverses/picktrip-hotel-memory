import type { Client } from "@elastic/elasticsearch";

export class ElasticConversationStore {
  constructor(
    private readonly client: Client,
    private readonly indexName = process.env.CONVERSATION_INDEX_ALIAS ?? "picktrip-memory-turns",
  ) {}

  async append(input: {
    resourceId: string;
    threadId: string;
    role: "user" | "assistant";
    message: string;
    destination: string;
  }): Promise<string> {
    const eventId = crypto.randomUUID();
    await this.client.index({
      index: this.indexName,
      id: eventId,
      document: {
        event_id: eventId,
        resource_id: input.resourceId,
        thread_id: input.threadId,
        role: input.role,
        message: input.message,
        message_semantic: input.message,
        destination: input.destination,
        created_at: new Date().toISOString(),
      },
      refresh: "wait_for",
    });
    return eventId;
  }
}
