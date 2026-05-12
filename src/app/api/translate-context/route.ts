import { NextRequest, NextResponse } from "next/server";
import { translateBusinessContext } from "@/agents/context";
import { saveWatchtowerConfig, saveBusinessProfile, type BusinessProfile } from "@/lib/data";

export async function POST(req: NextRequest) {
  const profile = await req.json() as BusinessProfile;

  // Save profile first
  await saveBusinessProfile(profile);

  // Translate to watchtower config via AI
  const watchtowerConfig = await translateBusinessContext(profile);
  await saveWatchtowerConfig(watchtowerConfig);

  return NextResponse.json(watchtowerConfig);
}
