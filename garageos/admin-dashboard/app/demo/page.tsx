import type { Metadata } from "next";
import Link from "next/link";
import { Check, Eye } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { DemoEntryButton } from '@/components/auth/demo-entry-button';
import "@/components/marketing/marketing.css";

export const metadata: Metadata = {
  title: "GarageOS — Live demo",
  description: "Explore GarageOS on real demo data — no signup, no email. A read-only tour of the whole platform.",
};

const HIGHLIGHTS = [
  "Dashboard, scheduling & operations",
  "Vehicle Intelligence & passports",
  "Customer 360, billing & reports",
  "The Telegram customer app",
];

// The client button coordinates demo identity with login/logout in other tabs.
export default function DemoEntryPage() {
  return (
    <div className="mkt" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "40px 20px" }}>
      <div className="mkt-hero__glow" aria-hidden style={{ height: 520 }} />
      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 560, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 26 }}>
          <Logo theme="auto" size={26} />
        </div>
        <span className="mkt-eyebrow"><Eye size={14} /> Live demo · no signup</span>
        <h1 className="mkt-display" style={{ fontSize: "clamp(30px,5vw,46px)", margin: "20px 0 0" }}>
          Explore the whole platform
        </h1>
        <p className="mkt-hero__sub" style={{ margin: "16px auto 0" }}>
          Step into a fully-loaded demo garage — real data, every screen. It{"’"}s a
          read-only tour, so click freely; nothing you do changes the data.
        </p>

        <ul style={{ listStyle: "none", padding: 0, margin: "28px auto 0", display: "grid", gap: 12, maxWidth: 340, textAlign: "left" }}>
          {HIGHLIGHTS.map((h) => (
            <li key={h} style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--mkt-ink)", fontSize: 15 }}>
              <Check size={17} style={{ color: "var(--mkt-gold)", flex: "none" }} /> {h}
            </li>
          ))}
        </ul>

        <div className="mkt-hero__cta" style={{ marginTop: 32 }}>
          <DemoEntryButton />
        </div>
        <p className="mkt-hero__trust" style={{ marginTop: 18 }}>
          Read-only · the data stays pristine for the next visitor ·{" "}
          <Link href="/" style={{ color: "var(--mkt-muted)", textDecoration: "underline" }}>back to site</Link>
        </p>
      </div>
    </div>
  );
}
