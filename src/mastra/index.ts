import { Mastra } from "@mastra/core";
import { MastraStorageExporter, Observability } from "@mastra/observability";
import { hotelMemoryAgent } from "./agents/hotel-memory-agent";
import { hotelStorage } from "./memory";
import { hotelChatRoute } from "./routes/hotel-chat-route";

export const mastra = new Mastra({
  agents: { hotelMemoryAgent },
  storage: hotelStorage,
  server: { apiRoutes: [hotelChatRoute] },
  observability: new Observability({
    configs: {
      default: {
        serviceName: "picktrip-hotel-memory",
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
});
