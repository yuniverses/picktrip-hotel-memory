import { mastra } from "../mastra";

const agent = mastra.getAgent("hotelMemoryAgent");
if (agent.id !== "hotel-memory-agent") {
  throw new Error("Mastra hotel memory agent registration is invalid");
}

console.log("Mastra source smoke ready: hotelMemoryAgent + hotel-memory-agent");
