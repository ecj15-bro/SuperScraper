"use client";

import { useState, useEffect } from "react";
import type { BusinessProfile, BrandConfig, WatchtowerConfig } from "@/lib/data";

type Tab = "brand" | "profile" | "watchtower";

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("profile");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>Settings</h1>
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--card-border)", paddingBottom: "0.5rem" }}>
        {(["profile", "brand", "watchtower"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? "var(--accent)" : "transparent",
              color: tab === t ? "white" : "var(--muted)",
              border: "none", borderRadius: "0.375rem",
              padding: "0.4rem 0.875rem", fontSize: "0.875rem",
              cursor: "pointer", fontWeight: tab === t ? 600 : 400,
              textTransform: "capitalize",
            }}
          >
            {t === "profile" ? "Business Profile" : t === "brand" ? "Brand" : "Watchtower"}
          </button>
        ))}
      </div>
      {tab === "brand"      && <BrandPanel />}
      {tab === "profile"    && <ProfilePanel />}
      {tab === "watchtower" && <WatchtowerPanel />}
    </div>
  );
}

// ─── BRAND PANEL ─────────────────────────────────────────────────────────────

function BrandPanel() {
  const [form, setForm] = useState<BrandConfig>({ companyName: "", tagline: "", primaryColor: "#6366f1" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/brand").then(r => r.json()).then(d => { if (d.companyName) setForm(d); });
  }, []);

  async function save() {
    await fetch("/api/brand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "480px" }}>
      <Field label="Company Name" value={form.companyName} onChange={v => setForm(s => ({ ...s, companyName: v }))} />
      <Field label="Tagline" value={form.tagline} onChange={v => setForm(s => ({ ...s, tagline: v }))} />
      <Field label="Brand Color (hex)" value={form.primaryColor} onChange={v => setForm(s => ({ ...s, primaryColor: v }))} />
      <button onClick={save} className="btn btn-primary">{saved ? "Saved!" : "Save Brand"}</button>
    </div>
  );
}

// ─── BUSINESS PROFILE PANEL ──────────────────────────────────────────────────

function ProfilePanel() {
  const [form, setForm] = useState<BusinessProfile>({
    companyName: "", websiteUrl: "", whatYouSell: "", whoBuysFromYou: "",
    whyChooseYou: "", avgDealSize: "10k-50k", salesCycleLength: "weeks",
    distributionModel: [], lookingFor: [],
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved]     = useState(false);
  const [translated, setTranslated] = useState(false);

  useEffect(() => {
    fetch("/api/business-profile").then(r => r.json()).then(d => { if (d.whatYouSell) setForm(d); });
  }, []);

  async function save() {
    await fetch("/api/business-profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function translate() {
    setLoading(true);
    try {
      await fetch("/api/translate-context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setTranslated(true);
      setTimeout(() => setTranslated(false), 3000);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "600px" }}>
      <Field label="Company Name" value={form.companyName} onChange={v => setForm(s => ({ ...s, companyName: v }))} />
      <Field label="Website" value={form.websiteUrl} onChange={v => setForm(s => ({ ...s, websiteUrl: v }))} />
      <Field label="What You Sell" value={form.whatYouSell} onChange={v => setForm(s => ({ ...s, whatYouSell: v }))} multiline />
      <Field label="Who Buys From You" value={form.whoBuysFromYou} onChange={v => setForm(s => ({ ...s, whoBuysFromYou: v }))} multiline />
      <Field label="Why Choose You" value={form.whyChooseYou} onChange={v => setForm(s => ({ ...s, whyChooseYou: v }))} multiline />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <SelectField
          label="Avg Deal Size"
          value={form.avgDealSize}
          options={["under10k", "10k-50k", "50k-100k", "100k+", "enterprise"]}
          onChange={v => setForm(s => ({ ...s, avgDealSize: v as any }))}
        />
        <SelectField
          label="Sales Cycle"
          value={form.salesCycleLength}
          options={["days", "weeks", "1-3months", "3-6months", "6months+"]}
          onChange={v => setForm(s => ({ ...s, salesCycleLength: v as any }))}
        />
      </div>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button onClick={save} className="btn btn-secondary">{saved ? "Saved!" : "Save Profile"}</button>
        <button onClick={translate} disabled={loading || !form.whatYouSell} className="btn btn-primary">
          {loading ? "Generating..." : translated ? "Watchtower Updated!" : "Generate Watchtower Config"}
        </button>
      </div>
      <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>
        "Generate Watchtower Config" uses AI to create search queries, competitor detection, and scoring rules from your profile.
      </p>
    </div>
  );
}

// ─── WATCHTOWER PANEL ────────────────────────────────────────────────────────

function WatchtowerPanel() {
  const [config, setConfig] = useState<WatchtowerConfig | null>(null);

  useEffect(() => {
    fetch("/api/business-profile")
      .then(r => r.json())
      .then(profile => {
        if (profile.whatYouSell) {
          return fetch("/api/translate-context", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(profile),
          }).then(r => r.json()).then(setConfig);
        }
      })
      .catch(() => {});

    // Try loading existing config
    fetch("/api/business-profile").then(r => r.json()).catch(() => null);
  }, []);

  if (!config) {
    return (
      <div className="card" style={{ color: "var(--muted)", textAlign: "center", padding: "2rem" }}>
        No Watchtower config generated yet. Fill in your Business Profile and click "Generate Watchtower Config".
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="card">
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>
          Ideal Partner Profile
        </h3>
        <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.6 }}>{config.idealVARProfile}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <ListCard title="Target Verticals" items={config.targetVerticals} color="var(--success)" />
        <ListCard title="Avoid Verticals" items={config.avoidVerticals} color="var(--danger)" />
        <ListCard title="Competitor Names" items={config.competitorNames} color="var(--danger)" />
        <ListCard title="Partner Ecosystem" items={config.partnerEcosystem} color="var(--accent)" />
      </div>
      <div className="card">
        <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>
          Search Categories ({config.searchCategories.length})
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {config.searchCategories.map((cat, i) => (
            <div key={i} style={{ paddingLeft: "1rem", borderLeft: "2px solid var(--card-border)" }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 600 }}>{cat.name} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({cat.priority})</span></div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.25rem" }}>{cat.queries.join(" · ")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

function Field({ label, value, onChange, multiline }: { label: string; value: string; onChange: (v: string) => void; multiline?: boolean }) {
  const style: React.CSSProperties = {
    background: "var(--background)", border: "1px solid var(--card-border)",
    borderRadius: "0.375rem", padding: "0.5rem 0.75rem", color: "var(--foreground)",
    fontSize: "0.875rem", width: "100%", outline: "none",
  };
  return (
    <div>
      <label style={{ fontSize: "0.8rem", color: "var(--muted)", display: "block", marginBottom: "0.375rem" }}>{label}</label>
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} style={{ ...style, minHeight: "80px", resize: "vertical" }} />
        : <input value={value} onChange={e => onChange(e.target.value)} style={style} />
      }
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label style={{ fontSize: "0.8rem", color: "var(--muted)", display: "block", marginBottom: "0.375rem" }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ background: "var(--background)", border: "1px solid var(--card-border)", borderRadius: "0.375rem", padding: "0.5rem 0.75rem", color: "var(--foreground)", fontSize: "0.875rem", width: "100%" }}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function ListCard({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <div className="card">
      <h3 style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>{title}</h3>
      {items.length === 0
        ? <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>None configured</div>
        : <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
            {items.map((item, i) => <li key={i} style={{ fontSize: "0.8rem", color, lineHeight: 1.8 }}>{item}</li>)}
          </ul>
      }
    </div>
  );
}
