import { NextResponse } from "next/server";
import { resolveFirebaseConfig } from "@/src/lib/config/firebase-runtime";

export const runtime = "nodejs";

export async function GET() {
  const config = await resolveFirebaseConfig();
  return NextResponse.json({
    enabled: true,
    config,
  });
}
