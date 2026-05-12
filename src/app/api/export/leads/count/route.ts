import { NextResponse } from "next/server";
import { getPendingCount } from "@/lib/export-queue";

export async function GET() {
  const count = await getPendingCount();
  return NextResponse.json({ count });
}
