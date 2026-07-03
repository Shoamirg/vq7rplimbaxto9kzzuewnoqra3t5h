import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — GarageOS",
  description: "The terms that govern use of the GarageOS platform.",
};

export default function TermsPage() {
  return (
    <section className="mkt-section">
      <div className="mkt-shell">
        <div className="mkt-page-head" style={{ padding: 0, textAlign: "left" }}>
          <h1 className="mkt-display mkt-page-title" style={{ margin: 0, maxWidth: "none" }}>Terms of Service</h1>
        </div>
        <div className="mkt-prose" style={{ marginTop: 28 }}>
          <p className="mkt-prose__meta">Last updated: 3 July 2026</p>
          <div className="mkt-callout">
            This is a starting-point template. Before you launch, have it reviewed by qualified legal
            counsel to match your jurisdiction, entity, and commercial terms.
          </div>

          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern access to and use of the GarageOS platform
            (the &ldquo;Service&rdquo;). By using the Service, you agree to these Terms on behalf of your business
            (&ldquo;Customer&rdquo;).
          </p>

          <h2 id="accounts">Accounts</h2>
          <p>
            You are responsible for your account, for the security of your credentials, and for the
            actions of users you invite. You must provide accurate information and promptly update it.
          </p>

          <h2 id="acceptable-use">Acceptable use</h2>
          <p>You agree not to misuse the Service, including by attempting to:</p>
          <ul>
            <li>access data belonging to another Customer;</li>
            <li>disrupt, probe, or overload the Service;</li>
            <li>reverse engineer or resell the Service without authorization;</li>
            <li>use the Service to store unlawful content or to violate the rights of others.</li>
          </ul>

          <h2 id="data">Customer data &amp; ownership</h2>
          <p>
            As between the parties, Customer owns all data it submits to the Service. Customer grants us
            a limited license to host and process that data solely to provide the Service. We process
            personal data as described in the <a href="/privacy">Privacy Policy</a>. Customer can export
            its data at any time.
          </p>

          <h2 id="billing">Fees &amp; billing</h2>
          <p>
            Paid plans are billed per location on a recurring basis. Fees are due in advance and are
            non-refundable except where required by law. We may change pricing with reasonable notice
            effective at the next billing cycle.
          </p>

          <h2 id="trials">Trials &amp; demo</h2>
          <p>
            Any public demo is provided for evaluation only, on a read-only basis, and may be changed
            or withdrawn at any time. Trials, if offered, convert to a paid plan unless cancelled before
            the trial ends.
          </p>

          <h2 id="ip">Intellectual property</h2>
          <p>
            The Service, including its software, design, and brand, is owned by GarageOS and protected by
            law. These Terms grant no rights to our intellectual property except the limited right to use
            the Service.
          </p>

          <h2 id="warranty">Warranties &amp; liability</h2>
          <p>
            The Service is provided &ldquo;as is&rdquo; without warranties of any kind to the maximum extent
            permitted by law. To the extent permitted by law, our aggregate liability arising out of or
            related to the Service is limited to the fees paid by Customer in the twelve months preceding
            the claim, and we are not liable for indirect or consequential damages.
          </p>

          <h2 id="termination">Termination</h2>
          <p>
            Either party may terminate for material breach that remains uncured after notice. On
            termination, access ends and we will make Customer data available for export for a limited
            period before deletion.
          </p>

          <h2 id="changes">Changes, governing law &amp; contact</h2>
          <p>
            We may update these Terms and will revise the date above; continued use constitutes
            acceptance. These Terms are governed by the laws of the jurisdiction stated in your order or,
            absent one, the jurisdiction of GarageOS. Questions:{" "}
            <a href="mailto:legal@garageos.app">legal@garageos.app</a>.
          </p>
        </div>
      </div>
    </section>
  );
}
