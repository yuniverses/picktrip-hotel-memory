import { getPicktripApiUrl } from "./config";

export type PicktripHistoryConversation = {
  conversationId: string;
};

export type PicktripHistoryMessage = {
  messageId: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: string;
};

export type PicktripHistoryClient = {
  listConversations(limit?: number): Promise<PicktripHistoryConversation[]>;
  getConversationMessages(conversationId: string): Promise<PicktripHistoryMessage[]>;
};

type Fetcher = typeof fetch;

export function createPicktripHistoryClient(
  token: string,
  fetcher: Fetcher = fetch,
  apiUrl = getPicktripApiUrl(),
): PicktripHistoryClient {
  const baseUrl = apiUrl.replace(/\/$/, "");
  const request = async (path: string): Promise<unknown> => {
    const response = await fetcher(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Picktrip history API returned ${response.status}`);
    }
    return response.json().catch(() => null);
  };

  return {
    async listConversations(limit = 100) {
      const boundedLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
      const payload = await request(`/agent/conversations/display-history?limit=${boundedLimit}`);
      return recordsFromPayload(payload, ["conversations", "items"])
        .map(normalizeConversation)
        .filter((value): value is PicktripHistoryConversation => value !== null)
        .slice(0, boundedLimit);
    },

    async getConversationMessages(conversationId) {
      const payload = await request(
        `/agent/conversations/${encodeURIComponent(conversationId)}/display-history`,
      );
      return recordsFromPayload(payload, ["messages", "items"])
        .map((value) => normalizeMessage(value, conversationId))
        .filter((value): value is PicktripHistoryMessage => value !== null);
    },
  };
}

function normalizeConversation(value: Record<string, unknown>): PicktripHistoryConversation | null {
  const conversationId = stringValue(value, ["conversationId", "id", "_id"]);
  return conversationId ? { conversationId } : null;
}

function normalizeMessage(
  value: Record<string, unknown>,
  fallbackConversationId: string,
): PicktripHistoryMessage | null {
  const messageId = stringValue(value, ["messageId", "id", "_id"]);
  const content = stringValue(value, ["content", "message", "text"]);
  const createdAt = stringValue(value, ["createdAt", "created_at", "timestamp"]);
  const role = stringValue(value, ["role", "senderRole", "sender"]);
  if (!messageId || !content || !createdAt || !role) return null;
  return {
    messageId,
    conversationId:
      stringValue(value, ["conversationId", "conversation_id"]) ?? fallbackConversationId,
    role: role.toLowerCase(),
    content,
    createdAt,
  };
}

function recordsFromPayload(payload: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.flatMap(recordArray);
  const root = recordValue(payload);
  if (!root) return [];
  const data = root.data;
  if (Array.isArray(data)) return data.flatMap(recordArray);
  const container = recordValue(data) ?? root;
  for (const key of keys) {
    const records = container[key];
    if (Array.isArray(records)) return records.flatMap(recordArray);
  }
  return [];
}

function recordArray(value: unknown): Record<string, unknown>[] {
  const record = recordValue(value);
  return record ? [record] : [];
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}
