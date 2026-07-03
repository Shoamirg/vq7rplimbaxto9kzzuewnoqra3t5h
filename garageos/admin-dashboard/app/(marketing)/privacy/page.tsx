import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — GarageOS",
  description: "How GarageOS collects, uses, and protects personal data.",
};

export default function PrivacyPage() {
  return (
    <section className="mkt-section">
      <div className="mkt-shell">
        <div className="mkt-page-head" style={{ padding: 0, textAlign: "left" }}>
          <h1 className="mkt-display mkt-page-title" style={{ margin: 0, maxWidth: "none" }}>Privacy Policy</h1>
        </div>
        <div className="mkt-prose" style={{ marginTop: 28 }}>
          <p className="mkt-prose__meta">Last updated: 3 July 2026</p>
          <div className="mkt-callout">
            This is a starting-point policy template. Before you launch, have it reviewed by qualified
            legal counsel to match your jurisdiction, entity, and data-processing practices.
          </div>

          <p>
            GarageOS (&ldquo;GarageOS&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) provides garage-management software to
            businesses (each a &ldquo;Customer&rdquo;). This policy explains how we handle personal data when you
            visit our website and when a Customer uses the platform.
          </p>

          <h2 id="collect">Information we collect</h2>
          <ul>
            <li><strong>Account data</strong> — name, work email, and role of the staff who use GarageOS.</li>
            <li><strong>Customer-provided data</strong> — records a garage enters about its own customers and vehicles (contact details, vehicle history, appointments, invoices).</li>
            <li><strong>Usage data</strong> — logs, device and browser information, and diagnostic events used to operate and secure the service.</li>
          </ul>
          <p>
            For data a garage enters about its own customers, the garage is the data controller and
            GarageOS acts as a processor on its behalf.
          </p>

          <h2 id="use">How we use data</h2>
          <ul>
            <li>To provide, maintain, and secure the platform.</li>
            <li>To authenticate users and prevent abuse.</li>
            <li>To provide support and communicate about the service.</li>
            <li>To improve reliability and performance.</li>
          </ul>
          <p>We do not sell personal data, and we do not use Customer data to train machine-learning models.</p>

          <h2 id="sharing">Sharing</h2>
          <p>
            We share data only with infrastructure sub-processors needed to run the service (for
            example, hosting, database, and error-monitoring providers), each under appropriate
            contractual safeguards; when required by law; or with your instruction.
          </p>

          <h2 id="retention">Retention</h2>
          <p>
            We retain personal data for as long as an account is active and as needed to provide the
            service, then delete or anonymize it within a reasonable period after termination, unless
            a longer period is required by law.
          </p>

          <h2 id="security">Security</h2>
          <p>
            We use tenant isolation, encryption in transit, hardened authentication, audit logging,
            and tested backups. See our <a href="/security">Security page</a> for details. No system is
            perfectly secure, but we work continuously to protect your data.
          </p>

          <h2 id="rights">Your rights</h2>
          <p>
            Depending on your location, you may have rights to access, correct, export, or delete your
            personal data. Customers can export their data at any time. To exercise a right, contact us
            using the details below; for data a garage holds about you as its customer, please contact
            that garage.
          </p>

          <h2 id="transfers">International transfers &amp; children</h2>
          <p>
            Where data is processed across borders, we rely on appropriate legal transfer mechanisms.
            The service is not directed to children and is intended for business use.
          </p>

          <h2 id="changes">Changes &amp; contact</h2>
          <p>
            We may update this policy from time to time and will revise the date above. Questions or
            requests: <a href="mailto:privacy@garageos.app">privacy@garageos.app</a>.
          </p>
        </div>
      </div>
    </section>
  );
}
