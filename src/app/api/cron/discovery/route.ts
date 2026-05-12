import { NextRequest, NextResponse } from "next/server";
import { ingestTokens, proposeEmergingVerticals } from "@/lib/discovery/cluster";
import { getEnv } from "@/lib/env";

export async function GET(req: NextRequest) {
  if (req.headers.get("Authorization") !== `Bearer ${getEnv().cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const tokenResult = await ingestTokens();
    const proposals = await proposeEmergingVerticals();
    return NextResponse.json({ ...tokenResult, proposals });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
