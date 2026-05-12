import { db } from "../src/lib/db/client";
import { verticals } from "../src/lib/db/schema";

const SEED_VERTICALS = [
  { id: "defense",       name: "Defense & Aerospace",        keywords: ["defense","aerospace","military","DoD","army","navy","air force","space force","weapons","munitions","combat","missile"], priority: 1, minAwardValue: 50_000 },
  { id: "it_services",   name: "IT & Cybersecurity",         keywords: ["cybersecurity","information technology","IT","software","cloud","network","data center","zero trust","SIEM","SOC","systems integration"], priority: 1, minAwardValue: 25_000 },
  { id: "healthcare",    name: "Healthcare & Medical",       keywords: ["healthcare","medical","health","hospital","clinical","pharmaceutical","biomedical","telemedicine","EHR","EMR"], priority: 2, minAwardValue: 10_000 },
  { id: "logistics",     name: "Logistics & Supply Chain",   keywords: ["logistics","supply chain","transportation","shipping","warehousing","fulfillment","freight","cargo","fleet","distribution"], priority: 2, minAwardValue: 10_000 },
  { id: "construction",  name: "Construction & Engineering", keywords: ["construction","engineering","infrastructure","facilities","HVAC","electrical","plumbing","architecture","civil","structural"], priority: 2, minAwardValue: 10_000 },
  { id: "professional",  name: "Professional Services",      keywords: ["consulting","advisory","management","training","staffing","legal","accounting","financial","audit","compliance"], priority: 3, minAwardValue: 5_000 },
  { id: "environmental", name: "Environmental & Energy",     keywords: ["environmental","remediation","energy","renewable","solar","wind","sustainability","EPA","clean water","hazmat"], priority: 3, minAwardValue: 5_000 },
  { id: "research",      name: "Research & Development",     keywords: ["research","development","R&D","laboratory","science","technology","innovation","prototype","testing","evaluation"], priority: 3, minAwardValue: 5_000 },
];

async function seed() {
  console.log("Seeding verticals...");
  for (const v of SEED_VERTICALS) {
    await db
      .insert(verticals)
      .values(v)
      .onConflictDoUpdate({
        target: verticals.id,
        set: { name: v.name, keywords: v.keywords, priority: v.priority, minAwardValue: v.minAwardValue },
      });
    console.log(`  Upserted: ${v.name}`);
  }
  console.log("Done.");
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
