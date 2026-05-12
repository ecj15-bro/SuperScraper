"use client";

import { useState, useEffect } from "react";
import type { ReportEntry } from "@/lib/data";

export default function LeadsPage() {
  const [leads, setLeads]     = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ReportEntry | null>(null);
  const [filter, setFilter]   = useState("");

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => r.json())
      .then((d) => { setLeads(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = leads.filter((l) =>
    !filter ||
    l.companyName.toLowerCase().includes(filter.toLowerCase()) ||
    l.decisionMaker.toLowerCase().includes(filter.toLowerCase()),
  );

  async function handleDelete(id: string) {
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
    setLeads((prev) => prev.filter((l) => l.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  if (loading) return <div style={{ color: "var(--muted)" }}>Loading leads...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>Leads ({leads.length})</h1>
        <input
          placeholder="Filter by company or contact..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            background: "var(--card)", border: "1px solid var(--card-border)",
            borderRadius: "0.5rem", padding: "0.5rem 0.75rem", color: "var(--foreground)",
            fontSize: "0.875rem", width: "260px",
          }}
        />
      </div>

      {filtered.length === 0 && (
        <div className="card" style={{ textAlign: "center", color: "var(--muted)", padding: "3rem" }}>
          No leads yet. Run the pipeline from the Dashboard to start generating leads.
        </div>
      )}

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {filtered.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            selected={selected?.id === lead.id}
            onSelect={() => setSelected(selected?.id === lead.id ? null : lead)}
            onDelete={() => handleDelete(lead.id)}
          />
        ))}
      </div>
    </div>
  );
}

function fitBadge(score: any) {
  if (!score) return null;
  const cls = `badge badge-${score.fitCategory ?? "moderate"}`;
  return <span className={cls}>{score.fitCategory} {score.overallScore}/10</span>;
}

function LeadCard({
  lead, selected, onSelect, onDelete,
}: {
  lead: ReportEntry;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="card"
      style={{
        cursor: "pointer",
        borderColor: selected ? "var(--accent)" : "var(--card-border)",
        transition: "border-color 0.15s",
      }}
      onClick={onSelect}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <strong style={{ fontSize: "1rem" }}>{lead.companyName}</strong>
            {fitBadge(lead.varFitScore)}
            {lead.relevanceScore && (
              <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                relevance {lead.relevanceScore}/10
              </span>
            )}
          </div>
          <div style={{ fontSize: "0.875rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            {lead.decisionMaker} {lead.title ? `— ${lead.title}` : ""}
          </div>
          {lead.newsTitle && (
            <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.25rem", fontStyle: "italic" }}>
              {lead.newsTitle}
            </div>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", padding: "0.25rem", fontSize: "1rem" }}
          title="Delete lead"
        >
          &times;
        </button>
      </div>

      {selected && (
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }} onClick={(e) => e.stopPropagation()}>
          {lead.briefing && (
            <Section title="Briefing">
              <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.6 }}>{lead.briefing}</p>
            </Section>
          )}
          {lead.personalizedIntro && (
            <Section title="Personalized Intro">
              <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.6, color: "var(--success)" }}>{lead.personalizedIntro}</p>
            </Section>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {lead.companyProfile && (
              <Section title="Company">
                <p style={{ margin: 0, fontSize: "0.8rem", lineHeight: 1.6, color: "var(--muted)" }}>{lead.companyProfile}</p>
              </Section>
            )}
            {lead.personProfile && (
              <Section title="Decision Maker">
                <p style={{ margin: 0, fontSize: "0.8rem", lineHeight: 1.6, color: "var(--muted)" }}>{lead.personProfile}</p>
              </Section>
            )}
          </div>
          {lead.pitch && (
            <Section title="Pitch">
              <pre style={{ margin: 0, fontSize: "0.8rem", lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "inherit", color: "var(--muted)" }}>
                {lead.pitch}
              </pre>
            </Section>
          )}
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            {lead.linkedinUrl && (
              <a href={lead.linkedinUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: "0.8rem" }}>
                LinkedIn
              </a>
            )}
            {lead.companyWebsite && (
              <a href={lead.companyWebsite} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: "0.8rem" }}>
                Website
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>
        {title}
      </div>
      {children}
    </div>
  );
}
