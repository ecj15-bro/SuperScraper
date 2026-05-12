import { NextRequest, NextResponse } from "next/server";
import { getReports, deleteReport } from "@/lib/data";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reports = await getReports();
  const report = reports.find((r) => r.id === id);
  if (!report) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  return NextResponse.json(report);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = await deleteReport(id);
  if (!deleted) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
