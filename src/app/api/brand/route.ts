import { NextRequest, NextResponse } from "next/server";
import { getStoredBrandConfig, saveBrandConfig, type BrandConfig } from "@/lib/data";

export async function GET() {
  const config = await getStoredBrandConfig();
  return NextResponse.json(config ?? {});
}

export async function POST(req: NextRequest) {
  const body = await req.json() as BrandConfig;
  await saveBrandConfig(body);
  return NextResponse.json({ ok: true });
}
