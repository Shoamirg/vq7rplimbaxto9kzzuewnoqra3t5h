import type { Metadata } from "next";
import { Boxes, DownloadCloud, FileClock, KeyRound, Lock, RefreshCw, ShieldCheck } from "lucide-react";

import { MarketingCta } from "@/components/marketing/chrome";

export const metadata: Metadata = {
  title: "Security & Trust — GarageOS",
  description: "How GarageOS protects your garage's data: tenant isolation, encryption in transit, audit logs, daily backups, restore testing, and full data ownership.",
};

const PILLARS = [
  { icon: Boxes, title: "Multi-tenant isolation", body: "Every garage's data is scoped to its own tenant at the data layer — cross-tenant reads and writes are impossible by construction, not just by convention." },
  { icon: Lock, title: "Encrypted in transit", body: "All traffic is served over HTTPS with automatic certificate management and HSTS. Nothing moves between browser and server in the clear." },
  { icon: KeyRound, title: "Hardened authentication", body: "Passwords are hashed with bcrypt; sessions use signed, expiring tokens. Login and sensitive endpoints are rate-limited to blunt brute-force attempts." },
  { icon: FileClock, title: "Audit trail", body: "An append-only audit log records security-relevant actions — logins, successes and failures — with source IP, so activity is always accountable." },
  { icon: RefreshCw, title: "Automated backups", body: "The database is backed up nightly with retention. Backups are verified by an automated restore test, because a backup you've never restored isn't a backup." },
  { icon: DownloadCloud, title: "You own your data", body: "Your customer, vehicle, and financial records are yours. Export them at any time. We never sell data or use it to train anything." },
];

export default function SecurityPage() {
  return (
    <>
      <section className="mkt-section mkt-page-head">
        <div className="mkt-shell">
          <span className="mkt-eyebrow"><ShieldCheck size={14} /> Security &amp; trust</span>
          <h1 className="mkt-display mkt-page-title">Built for real customer data</h1>
          <p className="mkt-page-sub">Garages run on trust — with their customers, and with the software that holds their business. Here&rsquo;s how GarageOS earns it.</p>
        </div>
      </section>

      <section className="mkt-section" style={{ paddingTop: 40 }}>
        <div className="mkt-shell">
          <div className="mkt-trust-grid">
            {PILLARS.map(({ icon: Icon, title, body }) => (
              <article className="mkt-trust" key={title}>
                <div className="mkt-trust__icon"><Icon size={20} /></div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>

          <div className="mkt-prose" style={{ marginTop: 72 }}>
            <h2 id="architecture">Isolation by architecture</h2>
            <p>
              GarageOS is multi-tenant from the ground up. Every business record carries its owning
              service center, and the data layer refuses any query that isn&rsquo;t scoped to the
              authenticated tenant. A garage can never see — or affect — another garage&rsquo;s data,
              even in the event of an application bug.
            </p>

            <h2 id="access">Access &amp; accountability</h2>
            <p>
              Staff authenticate with hashed credentials and short-lived, signed session tokens.
              Authentication and write-heavy endpoints are rate-limited. A tamper-evident,
              append-only <strong>audit log</strong> records logins and privileged actions with
              their source, so you always have an answer to &ldquo;who did what, and when.&rdquo;
            </p>

            <h2 id="continuity">Backups &amp; disaster recovery</h2>
            <p>
              The production database is backed up automatically every night and retained. Crucially,
              those backups are <strong>restore-tested</strong> on a schedule — restored into a
              throwaway environment and checked for integrity — so recovery is a proven procedure,
              not a hope. The whole platform is defined as infrastructure-as-code and can be
              rebuilt from a clean host in minutes.
            </p>

            <h2 id="data">Data ownership &amp; privacy</h2>
            <p>
              Your data belongs to you. You can export your customers, vehicles, and financial
              records at any time, and you can ask us to delete your workspace and its data on
              termination. We do not sell your data or use it to train machine-learning models.
              See our <a href="/privacy">Privacy Policy</a> for the full statement.
            </p>

            <div className="mkt-callout">
              Running a security review or need a signed agreement (DPA, custom terms)? Book a demo
              and we&rsquo;ll walk your team through the architecture and paperwork.
            </div>
          </div>
        </div>
      </section>

      <MarketingCta title="Put it to the test" body="Explore the platform in the live demo, or book a call to review the security architecture with your team." />
    </>
  );
}
