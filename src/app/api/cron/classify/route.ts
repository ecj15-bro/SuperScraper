import { NextRequest, NextResponse } from "next/server";
import { classifyBatch } from "@/lib/classify/pipeline";
import { getEnv } from "@/lib/env";

export async function GET(req: NextRequest) {
  if (req.headers.get("Authorization") !== `Bearer ${getEnv().cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await classifyBatch();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
