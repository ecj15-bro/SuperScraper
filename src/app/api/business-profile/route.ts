import { NextRequest, NextResponse } from "next/server";
import { getStoredBusinessProfile, saveBusinessProfile, type BusinessProfile } from "@/lib/data";

export async function GET() {
  const profile = await getStoredBusinessProfile();
  return NextResponse.json(profile ?? {});
}

export async function POST(req: NextRequest) {
  const body = await req.json() as BusinessProfile;
  await saveBusinessProfile(body);
  return NextResponse.json({ ok: true });
}
