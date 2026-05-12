import { NextRequest, NextResponse } from "next/server";
import { getReports } from "@/lib/data";

export async function GET(_req: NextRequest) {
  const reports = await getReports();
  return NextResponse.json(reports);
}
