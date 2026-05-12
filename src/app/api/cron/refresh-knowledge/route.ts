import { NextRequest, NextResponse } from "next/server";
import { runKnowledgeRefresh } from "@/agents/knowledge";
import { getEnv } from "@/lib/env";

export async function GET(req: NextRequest) {
  if (req.headers.get("Authorization") !== `Bearer ${getEnv().cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const kb = await runKnowledgeRefresh();
    return NextResponse.json(kb);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
