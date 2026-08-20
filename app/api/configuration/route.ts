import { NextResponse } from "next/server";
import { resolveFirebaseConfig } from "@/src/lib/config/firebase-runtime";
import { elasticConfigurationState } from "@/src/lib/elastic/client";

export async function GET() {
  const firebase = await resolveFirebaseConfig();
  return NextResponse.json({
    elasticsearch: elasticConfigurationState(),
    openrouter: { configured: Boolean(process.env.OPENROUTER_API_KEY) },
    mapbox: { configured: Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN) },
    firebase: { configured: Boolean(firebase.apiKey && firebase.projectId) },
    picktrip: { apiUrl: process.env.PICKTRIP_API_URL ?? "https://beta-api.picktrip.app" },
  });
}
