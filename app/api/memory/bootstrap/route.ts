import { type NextRequest, NextResponse } from "next/server";
import { getElasticClient } from "@/src/lib/elastic/client";
import { ElasticPreferenceStore } from "@/src/lib/elastic/preference-store";
import { PICKTRIP_TOKEN_COOKIE } from "@/src/lib/picktrip/config";
import { createPicktripHistoryClient } from "@/src/lib/picktrip/history-client";
import { verifyPicktripToken } from "@/src/lib/picktrip/session";
import { bootstrapHistoryMemory } from "@/src/server/history-memory-bootstrap";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(PICKTRIP_TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let resourceId: string;
  try {
    resourceId = (await verifyPicktripToken(token)).uid;
  } catch {
    return NextResponse.json({ error: "Picktrip session is invalid" }, { status: 401 });
  }

  try {
    const result = await bootstrapHistoryMemory({
      resourceId,
      historyClient: createPicktripHistoryClient(token),
      preferenceStore: new ElasticPreferenceStore(getElasticClient()),
    });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "History memory bootstrap failed" }, { status: 502 });
  }
}
