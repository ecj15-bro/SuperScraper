import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SuperScraper",
  description: "VAR & partner intelligence pipeline",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <nav style={{
          background: "var(--card)",
          borderBottom: "1px solid var(--card-border)",
          padding: "0 1.5rem",
          height: "3.5rem",
          display: "flex",
          alignItems: "center",
          gap: "2rem",
          position: "sticky",
          top: 0,
          zIndex: 100,
        }}>
          <span style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--accent)" }}>
            SuperScraper
          </span>
          <a href="/" style={navLinkStyle}>Dashboard</a>
          <a href="/leads" style={navLinkStyle}>Leads</a>
          <a href="/settings" style={navLinkStyle}>Settings</a>
        </nav>
        <main style={{ flex: 1, padding: "2rem 1.5rem", maxWidth: "72rem", margin: "0 auto", width: "100%" }}>
          {children}
        </main>
      </body>
    </html>
  );
}

const navLinkStyle: React.CSSProperties = {
  color: "var(--foreground)",
  textDecoration: "none",
  fontSize: "0.875rem",
  opacity: 0.8,
};
