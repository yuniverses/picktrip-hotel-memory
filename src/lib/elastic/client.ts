import { Client } from "@elastic/elasticsearch";

let client: Client | null = null;

export function getElasticClient(): Client {
  if (client) return client;
  const node = process.env.ELASTICSEARCH_URL;
  if (!node) throw new Error("ELASTICSEARCH_URL is required");
  const apiKey = process.env.ELASTICSEARCH_API_KEY;
  client = new Client({ node, ...(apiKey ? { auth: { apiKey } } : {}) });
  return client;
}

export function elasticConfigurationState() {
  return {
    configured: Boolean(process.env.ELASTICSEARCH_URL),
    authenticated: Boolean(process.env.ELASTICSEARCH_API_KEY),
    preferenceAlias:
      process.env.PREFERENCE_INDEX_ALIAS ??
      process.env.PREFERENCE_INDEX ??
      "picktrip-memory-preferences",
    conversationAlias: process.env.CONVERSATION_INDEX_ALIAS ?? "picktrip-memory-turns",
    version: process.env.ELASTIC_INDEX_VERSION ?? "v1",
  };
}
