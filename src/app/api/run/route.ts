import { NextResponse } from "next/server";
import { runOrchestrator } from "@/agents/orchestrator";

export async function POST() {
  try {
    const result = await runOrchestrator();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Run failed" },
      { status: 500 },
    );
  }
}
