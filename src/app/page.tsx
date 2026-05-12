"use client";

import { useState, useEffect } from "react";

interface JobResult {
  jobId: string;
  leadsEnqueued: number;
  leadsScanned: number;
  byCategory?: Record<string, { scanned: number; enqueued: number }>;
}

interface PipelineStats {
  exportCount: number;
  totalLeads: number;
}

export default function Dashboard() {
  const [running, setRunning]     = useState(false);
  const [lastRun, setLastRun]     = useState<JobResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [stats, setStats]         = useState<PipelineStats>({ exportCount: 0, totalLeads: 0 });

  useEffect(() => {
    fetch("/api/export/leads/count").then(r => r.ok ? r.json() : null).then(d => {
      if (d) setStats(s => ({ ...s, exportCount: d.count ?? 0 }));
    }).catch(() => {});
    fetch("/api/leads").then(r => r.ok ? r.json() : []).then((d: any[]) => {
      setStats(s => ({ ...s, totalLeads: d.length ?? 0 }));
    }).catch(() => {});
  }, [lastRun]);

  async function handleRun() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Run failed");
      setLastRun(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setRunning(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/export/leads");
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setStats(s => ({ ...s, exportCount: 0 }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>Pipeline Dashboard</h1>
          <p style={{ margin: "0.25rem 0 0", color: "var(--muted)", fontSize: "0.875rem" }}>
            News intelligence + federal contract leads, enriched and ready for outreach.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={handleExport}
            disabled={exporting || stats.exportCount === 0}
            className="btn btn-secondary"
            style={{ position: "relative" }}
          >
            {exporting ? "Exporting..." : "Export CSV"}
            {stats.exportCount > 0 && (
              <span style={{
                position: "absolute", top: "-6px", right: "-6px",
                background: "var(--accent)", color: "white",
                borderRadius: "9999px", fontSize: "0.65rem", fontWeight: 700,
                width: "18px", height: "18px", display: "flex", alignItems: "center", justifyContent: "center",
              }}>{stats.exportCount > 99 ? "99+" : stats.exportCount}</span>
            )}
          </button>
          <button onClick={handleRun} disabled={running} className="btn btn-primary">
            {running ? "Running..." : "Run Now"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: "#3b0a0a", border: "1px solid #7f1d1d", borderRadius: "0.5rem", padding: "0.75rem 1rem", color: "#f87171", fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
        <StatCard label="Total Leads" value={stats.totalLeads} />
        <StatCard label="Ready to Export" value={stats.exportCount} accent />
        <StatCard label="Last Run Enqueued" value={lastRun?.leadsEnqueued ?? "--"} />
      </div>

      {lastRun && (
        <div className="card">
          <h3 style={{ margin: "0 0 1rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Last Run Results
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem", fontSize: "0.875rem" }}>
            <div>Scanned: <strong>{lastRun.leadsScanned}</strong></div>
            <div>Enqueued: <strong style={{ color: "var(--success)" }}>{lastRun.leadsEnqueued}</strong></div>
          </div>
          {lastRun.byCategory && Object.keys(lastRun.byCategory).length > 0 && (
            <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {Object.entries(lastRun.byCategory).map(([cat, s]) => (
                <div key={cat} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--muted)" }}>
                  <span>{cat}</span>
                  <span>{s.enqueued}/{s.scanned}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Pipeline Overview
        </h3>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--muted)", lineHeight: 1.6 }}>
          Two acquisition channels feed one unified pipeline:
        </p>
        <ul style={{ margin: "0.75rem 0 0", paddingLeft: "1.25rem", fontSize: "0.875rem", color: "var(--muted)", lineHeight: 1.8 }}>
          <li><strong style={{ color: "var(--foreground)" }}>Watchtower</strong> — searches news for companies signaling partner readiness</li>
          <li><strong style={{ color: "var(--foreground)" }}>USASpending</strong> — ingests federal contract awards, scores by activity</li>
          <li>All leads pass two AI scoring gates and a competitor filter before being enriched</li>
          <li>Detective researches each company, Salesman generates personalized pitches</li>
          <li>Export CSV includes first/last name, personalized intro, LinkedIn, company, and source</li>
        </ul>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className="card" style={{ textAlign: "center" }}>
      <div style={{ fontSize: "2rem", fontWeight: 700, color: accent ? "var(--accent)" : "var(--foreground)" }}>
        {value}
      </div>
      <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.25rem" }}>{label}</div>
    </div>
  );
}
