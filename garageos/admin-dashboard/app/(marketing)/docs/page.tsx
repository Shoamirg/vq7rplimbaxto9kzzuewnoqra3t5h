import type { Metadata } from "next";

import { MarketingCta } from "@/components/marketing/chrome";

export const metadata: Metadata = {
  title: "Documentation — GarageOS",
  description: "Learn how to run your garage on GarageOS: appointments, customers, vehicles, passports, billing, reports, and the Telegram app.",
};

const SECTIONS: Array<{ id: string; title: string; body: React.ReactNode }> = [
  { id: "getting-started", title: "Getting started", body: (
    <>
      <p>GarageOS is your shop&rsquo;s operating system: scheduling, vehicles, customers, billing, and messaging in one place. Sign in with the account provided during onboarding and you land on the <strong>Dashboard</strong> — today&rsquo;s appointments, fleet health, revenue, and anything that needs attention.</p>
      <p>The quickest way to learn the product is to open the <a href="/demo">live demo</a> and click around a fully-loaded shop. Nothing there changes real data.</p>
    </>
  )},
  { id: "appointments", title: "Appointments & calendar", body: (
    <>
      <p>The <strong>Calendar</strong> is a day board with a lane per mechanic. Drag an appointment to move it, drag its edge to resize, and the board flags conflicts as you go. Use the status actions to confirm, start, or complete work.</p>
      <p>The <strong>Appointments</strong> list is the operational queue — filter by status or date, search, and act on rows in bulk. Completing a job automatically writes a service record and updates the vehicle&rsquo;s health.</p>
    </>
  )},
  { id: "customers", title: "Customers", body: (
    <p>Open a customer to see everything about them in one place — vehicles, spend and payment history, conversations, and a merged timeline. Commercial Health scores how they pay, so advisors know who to prioritize.</p>
  )},
  { id: "vehicles", title: "Vehicles", body: (
    <p>Each vehicle has a full record: identity, service history, and a computed <strong>health score</strong> from the maintenance engine. Health is derived from real mileage and service intervals — there is nothing to keep up to date by hand.</p>
  )},
  { id: "passport", title: "Digital Passport", body: (
    <p>The <strong>Vehicle Service Record</strong> is a shareable, print-ready document with a scannable QR code. It summarizes service information recorded in GarageOS and identifies the garage that supplied those records; it is not an independent inspection or guarantee of vehicle condition. Open any vehicle and choose &ldquo;View Service Record&rdquo;.</p>
  )},
  { id: "intelligence", title: "Vehicle Intelligence", body: (
    <p>The <strong>Vehicle Intelligence Center</strong> brings health, history, predictions, and commercial context into one view, with clickable subsystem hotspots. Predictions (next service, weakest system, breakdown risk) are deterministic — grounded in the data, not guesses.</p>
  )},
  { id: "operations", title: "Operations & inbox", body: (
    <>
      <p><strong>Operations</strong> is the dispatch console: emergencies, tows, and roadside calls become tracked cases with SLA timers and live status. Assign a technician and move the case through its lifecycle.</p>
      <p>The <strong>Inbox</strong> unifies every conversation — Telegram messages, walk-ins, internal notes — into one thread linked to the vehicle, case, or invoice it concerns.</p>
    </>
  )},
  { id: "billing", title: "Billing", body: (
    <p>Create <strong>estimates</strong> customers can approve from their phone, convert them to <strong>invoices</strong>, and record <strong>payments</strong>. Every financial action lands on an append-only ledger that always reconciles, and flows into your reports.</p>
  )},
  { id: "reports", title: "Reports", body: (
    <p><strong>Reports</strong> project over that ledger and your operational data: revenue and receivables, collection rate, estimate-to-invoice conversion, and fleet and commercial health. Each figure is drillable back to its source.</p>
  )},
  { id: "telegram", title: "Telegram customer app", body: (
    <p>Your customers get a zero-install app inside Telegram: they see their vehicle, approve estimates, message the shop, and call for roadside help. It runs on the same platform — a roadside request opens a real Operations case.</p>
  )},
  { id: "faq", title: "FAQ", body: (
    <>
      <p><strong>How do customers get the Telegram app?</strong> They open your garage&rsquo;s bot and tap to launch — no app store, no install.</p>
      <p><strong>Can I run more than one location?</strong> Yes, on the Enterprise plan, with consolidated reporting and per-location branding.</p>
      <p><strong>Is there an API?</strong> A public API is on the roadmap. Talk to us about your integration needs.</p>
    </>
  )},
];

export default function DocsPage() {
  return (
    <>
      <section className="mkt-section mkt-page-head">
        <div className="mkt-shell">
          <span className="mkt-eyebrow"><span className="mkt-eyebrow__dot" /> Documentation</span>
          <h1 className="mkt-display mkt-page-title">Everything you need to run the shop</h1>
          <p className="mkt-page-sub">A quick tour of each part of GarageOS. New to it? Start with the live demo, then use this as your reference.</p>
        </div>
      </section>

      <section className="mkt-section" style={{ paddingTop: 24 }}>
        <div className="mkt-shell">
          <div className="mkt-docs">
            <nav className="mkt-docs__toc" aria-label="Documentation contents">
              <h4>On this page</h4>
              <ul>
                {SECTIONS.map((s) => (
                  <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>
                ))}
              </ul>
            </nav>
            <div className="mkt-prose" style={{ margin: 0 }}>
              {SECTIONS.map((s) => (
                <div key={s.id}>
                  <h2 id={s.id}>{s.title}</h2>
                  {s.body}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <MarketingCta title="See the docs come to life" body="Open the live demo and follow along in a fully-loaded shop, or book a walkthrough with our team." />
    </>
  );
}
