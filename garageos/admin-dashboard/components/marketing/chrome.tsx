import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Logo } from "@/components/brand/logo";

// Shared marketing constants + chrome (nav + footer) used across every marketing
// page via the (marketing) route-group layout.

// The single place the "book a demo" destination is defined. Swap the mailto for a
// real scheduling link (Cal.com / Calendly / HubSpot) — one edit changes the whole site.
export const DEMO_HREF = "mailto:hello@garageos.app?subject=GarageOS%20demo%20request";
export const SIGN_IN_HREF = "/login";
export const LIVE_DEMO_HREF = "/demo";

const NAV_LINKS = [
  { href: "/#showroom", label: "Showroom" },
  { href: "/#workflow", label: "Workflow" },
  { href: "/#vehicle-passport", label: "Vehicle record" },
  { href: "/pricing", label: "Pricing" },
];

export function MarketingNav() {
  return (
    <header className="mkt-nav">
      <div className="mkt-shell mkt-nav__row">
        <Link href="/" aria-label="GarageOS home" className="mkt-nav__brand"><Logo theme="dark" size={24} className="mkt-nav__logo" /></Link>
        <nav className="mkt-nav__links" aria-label="Primary">
          {NAV_LINKS.map((l) => (<a key={l.href} href={l.href}>{l.label}</a>))}
        </nav>
        <div className="mkt-nav__cta">
          <a href={SIGN_IN_HREF} className="mkt-nav__signin">Sign in</a>
          <a href={DEMO_HREF} className="mkt-btn mkt-btn--primary" aria-label="Book a demo">
            <span className="mkt-nav__cta-label">Book a demo</span>
            <span className="mkt-nav__cta-label--compact" aria-hidden="true">Demo</span>
          </a>
        </div>
      </div>
    </header>
  );
}

// Reusable bottom conversion band for content pages.
export function MarketingCta({ title = "See it on real data", body = "Explore the whole platform right now on a fully-loaded demo shop — no signup — or book a walkthrough tailored to your operation." }: { title?: string; body?: string }) {
  return (
    <section className="mkt-section mkt-cta--slim">
      <div className="mkt-shell">
        <div className="mkt-cta">
          <h2 className="mkt-display">{title}</h2>
          <p>{body}</p>
          <div className="mkt-hero__cta" style={{ marginTop: 28 }}>
            <a href={LIVE_DEMO_HREF} className="mkt-btn mkt-btn--primary mkt-btn--lg">Explore the live demo <ArrowRight size={17} /></a>
            <a href={DEMO_HREF} className="mkt-btn mkt-btn--ghost mkt-btn--lg">Book a demo</a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function MarketingFooter() {
  return (
    <footer className="mkt-footer">
      <div className="mkt-shell">
        <div className="mkt-footer__grid">
          <div className="mkt-footer__brandcol">
            <Logo theme="dark" size={22} />
            <p>The operating system for modern garages — scheduling, vehicle intelligence, operations, billing, and customer messaging on one platform.</p>
          </div>
          <div className="mkt-footer__cols">
            <div>
              <h4>Product</h4>
              <ul>
                <li><Link href="/#features">Features</Link></li>
                <li><a href="/pricing">Pricing</a></li>
                <li><a href="/security">Security</a></li>
                <li><a href="/docs">Documentation</a></li>
                <li><a href={LIVE_DEMO_HREF}>Live demo</a></li>
              </ul>
            </div>
            <div>
              <h4>Company</h4>
              <ul>
                <li><a href={DEMO_HREF}>Book a demo</a></li>
                <li><a href={DEMO_HREF}>Contact</a></li>
                <li><a href={SIGN_IN_HREF}>Sign in</a></li>
              </ul>
            </div>
            <div>
              <h4>Legal</h4>
              <ul>
                <li><a href="/privacy">Privacy</a></li>
                <li><a href="/terms">Terms</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mkt-footer__bottom">
          <span>© 2026 GarageOS. All rights reserved.</span>
          <span>Built for the trade.</span>
        </div>
      </div>
    </footer>
  );
}
