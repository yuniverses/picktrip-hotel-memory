import type { EmbeddingModelV2 } from "@ai-sdk/provider";
import type { Client } from "@elastic/elasticsearch";

export function createElasticEmbedder(
  client: Client,
  inferenceId: string,
): EmbeddingModelV2<string> {
  return {
    specificationVersion: "v2",
    provider: "elasticsearch-inference",
    modelId: inferenceId,
    maxEmbeddingsPerCall: 32,
    supportsParallelCalls: true,
    async doEmbed({ values, abortSignal }) {
      const result = await client.inference.textEmbedding(
        { inference_id: inferenceId, input: values, input_type: "SEARCH" },
        { signal: abortSignal },
      );
      if (!result) throw new Error("Elasticsearch inference returned no response");
      const embeddings = result.text_embedding?.map((item) => item.embedding);
      if (!embeddings || embeddings.length !== values.length) {
        throw new Error("Elasticsearch inference returned an unexpected embedding response");
      }
      return { embeddings };
    },
  };
}
