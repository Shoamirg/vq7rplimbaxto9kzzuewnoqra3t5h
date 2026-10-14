import Image from "next/image";
import {
  ArrowDownRight,
  ArrowRight,
  CalendarDays,
  CarFront,
  Check,
  ClipboardList,
  Clock3,
  FileText,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { DEMO_HREF, LIVE_DEMO_HREF } from "@/components/marketing/chrome";
import { ShowroomSwitcher } from "@/components/marketing/showroom-switcher";

const WORKFLOW = [
  { number: "01", title: "Check in", detail: "Customer and vehicle" },
  { number: "02", title: "Inspect", detail: "Record the work" },
  { number: "03", title: "Approve", detail: "Agree the estimate" },
  { number: "04", title: "Complete", detail: "Close the job" },
  { number: "05", title: "Invoice", detail: "Record the payment" },
];

export function LandingPage() {
  return (
    <main className="mkt-home">
      <section className="mkt-home__hero" id="top" aria-labelledby="home-title">
        <div className="mkt-home__hero-grid mkt-shell">
          <div className="mkt-home__intro">
            <span className="mkt-home__eyebrow"><span /> Built for the work happening in your garage</span>
            <h1 id="home-title">Every vehicle. Every job. <em>One clear view.</em></h1>
            <p className="mkt-home__lede">
              Connect the customer, vehicle, work order, and invoice in one practical flow — so your team knows what is happening next.
            </p>
            <div className="mkt-home__actions">
              <a href={LIVE_DEMO_HREF} className="mkt-home__button mkt-home__button--dark">
                Explore the demo <ArrowRight size={17} aria-hidden="true" />
              </a>
              <a href={DEMO_HREF} className="mkt-home__button mkt-home__button--plain">Talk to our team</a>
            </div>
            <p className="mkt-home__note">A read-only preview with sample garage data. No account required.</p>
          </div>

          <div className="mkt-home__showcase" aria-label="GarageOS dashboard preview">
            <div className="mkt-home__showcase-top">
              <span className="mkt-home__window-dots" aria-hidden="true"><i /><i /><i /></span>
              <span>GarageOS workspace</span>
              <span className="mkt-home__sample"><span /> Sample data</span>
            </div>
            <div className="mkt-home__screen">
              <Image
                src="/marketing/dashboard.png"
                alt="GarageOS sample dashboard with appointments, vehicle health, and a revenue chart"
                fill
                priority
                sizes="(max-width: 900px) 100vw, 58vw"
              />
            </div>
            <div className="mkt-home__floating mkt-home__floating--top">
              <span className="mkt-home__floating-icon"><CalendarDays size={17} /></span>
              <span><strong>Work, in order</strong><small>Customer → vehicle → job</small></span>
            </div>
            <div className="mkt-home__floating mkt-home__floating--bottom">
              <span className="mkt-home__floating-icon mkt-home__floating-icon--green"><ShieldCheck size={17} /></span>
              <span><strong>Access by role</strong><small>Each teammate sees their work</small></span>
            </div>
          </div>
        </div>

        <div className="mkt-shell mkt-home__proof-row" aria-label="GarageOS capabilities">
          <div><CarFront size={19} /><span>Customer & vehicle records</span></div>
          <div><ClipboardList size={19} /><span>Service work orders</span></div>
          <div><FileText size={19} /><span>Estimates & invoices</span></div>
          <div><Clock3 size={19} /><span>Tashkent-local scheduling</span></div>
        </div>
      </section>

      <section className="mkt-home__section" id="showroom" aria-labelledby="showroom-title">
        <div className="mkt-shell">
          <div className="mkt-home__section-heading">
            <span className="mkt-home__eyebrow"><span /> One workflow, clear responsibilities</span>
            <h2 id="showroom-title">A useful view for every person in the shop.</h2>
            <p>Switch roles to preview how the same job moves from the front desk to the workshop and back to the customer.</p>
          </div>
          <ShowroomSwitcher />
        </div>
      </section>

      <section className="mkt-home__workflow-section" id="workflow" aria-labelledby="workflow-title">
        <div className="mkt-shell mkt-home__workflow-layout">
          <div className="mkt-home__workflow-heading">
            <span className="mkt-home__eyebrow"><span /> From arrival to a clear record</span>
            <h2 id="workflow-title">A job moves forward. Its history stays together.</h2>
            <p>Keep the details that matter with the work order: the vehicle, agreed work, assigned mechanic, and final invoice.</p>
            <a href={LIVE_DEMO_HREF} className="mkt-home__text-link">See the workflow in the demo <ArrowRight size={16} /></a>
          </div>
          <ol className="mkt-home__workflow-list">
            {WORKFLOW.map((step, index) => (
              <li key={step.number} className={index === WORKFLOW.length - 1 ? "is-last" : undefined}>
                <span className="mkt-home__step-number">{step.number}</span>
                <span className="mkt-home__step-copy"><strong>{step.title}</strong><small>{step.detail}</small></span>
                {index < WORKFLOW.length - 1 ? <ArrowDownRight className="mkt-home__step-arrow" size={18} aria-hidden="true" /> : <Check className="mkt-home__step-check" size={18} aria-hidden="true" />}
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mkt-home__section" id="vehicle-passport" aria-labelledby="passport-title">
        <div className="mkt-shell mkt-home__passport">
          <div className="mkt-home__passport-copy">
            <span className="mkt-home__eyebrow"><span /> Vehicle history, easy to follow</span>
            <h2 id="passport-title">A car’s service story, not a stack of paper.</h2>
            <p>Keep mileage, completed services, and maintenance notes together. Your team can review a vehicle’s record before recommending its next visit.</p>
            <ul>
              <li><Check size={17} /> Service timeline linked to the vehicle</li>
              <li><Check size={17} /> Maintenance reminders based on recorded mileage</li>
              <li><Check size={17} /> Shareable vehicle passport preview</li>
            </ul>
          </div>
          <div className="mkt-home__passport-image">
            <span className="mkt-home__image-caption"><Wrench size={15} /> Example vehicle record</span>
            <Image
              src="/marketing/vehicle-health.png"
              alt="Example vehicle record with service history, maintenance indicators, and vehicle health overview"
              width={2880}
              height={1800}
              sizes="(max-width: 900px) 100vw, 50vw"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      <section className="mkt-home__closing" id="pricing" aria-labelledby="closing-title">
        <div className="mkt-shell mkt-home__closing-card">
          <div>
            <span className="mkt-home__eyebrow mkt-home__eyebrow--dark"><span /> Start with your actual workflow</span>
            <h2 id="closing-title">See how GarageOS fits your service center.</h2>
            <p>Explore the sample workspace, then talk with us about the setup and pricing that fit your team.</p>
          </div>
          <div className="mkt-home__actions">
            <a href="/pricing" className="mkt-home__button mkt-home__button--green">View plans <ArrowRight size={17} aria-hidden="true" /></a>
            <a href={DEMO_HREF} className="mkt-home__button mkt-home__button--light">Book a walkthrough</a>
          </div>
        </div>
      </section>
    </main>
  );
}
