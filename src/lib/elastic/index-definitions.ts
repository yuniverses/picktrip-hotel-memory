export type IndexDefinition = {
  physicalName: string;
  alias: string;
  mappings: { properties: Record<string, Record<string, unknown>> };
};

export function buildIndexDefinitions(input: {
  preferenceAlias: string;
  conversationAlias: string;
  version: string;
  inferenceId?: string;
}): IndexDefinition[] {
  const semanticField: Record<string, unknown> = {
    type: "semantic_text",
    ...(input.inferenceId ? { inference_id: input.inferenceId } : {}),
  };
  return [
    {
      physicalName: `${input.preferenceAlias}-${input.version}`,
      alias: input.preferenceAlias,
      mappings: {
        properties: {
          preference_id: { type: "keyword" },
          resource_id: { type: "keyword" },
          thread_id: { type: "keyword" },
          category: { type: "keyword" },
          polarity: { type: "keyword" },
          statement: { type: "text" },
          statement_semantic: semanticField,
          confidence: { type: "float" },
          tags: { type: "keyword" },
          destination: { type: "keyword" },
          status: { type: "keyword" },
          source_message_id: { type: "keyword" },
          created_at: { type: "date" },
          updated_at: { type: "date" },
        },
      },
    },
    {
      physicalName: `${input.conversationAlias}-${input.version}`,
      alias: input.conversationAlias,
      mappings: {
        properties: {
          event_id: { type: "keyword" },
          resource_id: { type: "keyword" },
          thread_id: { type: "keyword" },
          role: { type: "keyword" },
          message: { type: "text" },
          message_semantic: semanticField,
          destination: { type: "keyword" },
          created_at: { type: "date" },
        },
      },
    },
  ];
}
