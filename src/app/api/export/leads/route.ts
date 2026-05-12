import { NextResponse } from "next/server";
import { getPendingExports, markExported, toCSV } from "@/lib/export-queue";

export async function GET() {
  const rows = await getPendingExports();
  if (!rows.length) {
    return NextResponse.json({ error: "No leads in export queue" }, { status: 404 });
  }

  const csv = toCSV(rows);
  const ids = rows.map((r) => r.id);
  await markExported(ids);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="leads-${Date.now()}.csv"`,
    },
  });
}
