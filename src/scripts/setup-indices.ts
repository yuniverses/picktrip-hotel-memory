import dotenv from "dotenv";
import { getElasticClient } from "../lib/elastic/client";
import { buildIndexDefinitions } from "../lib/elastic/index-definitions";

dotenv.config({ path: ".env.local" });
dotenv.config();

export async function setupIndices() {
  const client = getElasticClient();
  const definitions = buildIndexDefinitions({
    preferenceAlias:
      process.env.PREFERENCE_INDEX_ALIAS ??
      process.env.PREFERENCE_INDEX ??
      "picktrip-memory-preferences",
    conversationAlias: process.env.CONVERSATION_INDEX_ALIAS ?? "picktrip-memory-turns",
    version: process.env.ELASTIC_INDEX_VERSION ?? "v1",
    inferenceId: process.env.PREFERENCE_INFERENCE_ID ?? ".jina-embeddings-v5-text-small",
  });

  for (const definition of definitions) {
    const exists = await client.indices.exists({ index: definition.physicalName });
    if (!exists) {
      await client.indices.create({
        index: definition.physicalName,
        mappings: definition.mappings,
      });
    }
    const aliasExists = await client.indices.existsAlias({ name: definition.alias });
    if (!aliasExists) {
      await client.indices.putAlias({
        index: definition.physicalName,
        name: definition.alias,
        is_write_index: true,
      });
    }
  }
  return definitions.map(({ physicalName, alias }) => ({ physicalName, alias }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  setupIndices()
    .then((definitions) => {
      for (const definition of definitions) {
        process.stdout.write(`Ready: ${definition.physicalName} -> ${definition.alias}\n`);
      }
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
