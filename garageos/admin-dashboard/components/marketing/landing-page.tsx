import Image from "next/image";
import {
  ArrowDownRight,
  ArrowRight,
  CarFront,
  Check,
  ClipboardList,
  Clock3,
  FileText,
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

const CAPABILITIES = [
  {
    id: "linked-record",
    label: "CUSTOMER · VEHICLE · JOB",
    title: "Keep the whole job together.",
    detail: "Link the customer, vehicle, estimate, assigned mechanic, and invoice to one work order.",
    icon: CarFront,
    rows: [["Customer", "Linked"], ["Vehicle", "Service history"], ["Work order", "In progress"]],
  },
  {
    id: "estimate",
    label: "ESTIMATE",
    title: "Make agreed work easy to follow.",
    detail: "Keep the proposed work and its approval attached to the service record.",
    icon: FileText,
    rows: [["Scope", "Recorded"], ["Customer", "Approval"], ["Next step", "Invoice"]],
  },
  {
    id: "assigned-work",
    label: "TEAM ACCESS",
    title: "Give each person the right view.",
    detail: "Staff permissions follow their role; mechanics focus on work assigned to them.",
    icon: Wrench,
    rows: [["Service advisor", "Front desk"], ["Mechanic", "Assigned work"], ["Manager", "Operations"]],
  },
  {
    id: "local-time",
    label: "SERVICE SCHEDULE",
    title: "Schedule in the garage’s local time.",
    detail: "Appointments use the service center’s time zone, including Asia/Tashkent.",
    icon: Clock3,
    rows: [["Calendar", "Local time"], ["Service center", "Asia/Tashkent"], ["Booking", "Request"]],
  },
  {
    id: "vehicle-history",
    label: "VEHICLE HISTORY",
    title: "See what has already been done.",
    detail: "Keep mileage, completed services, and invoices with the vehicle’s history.",
    icon: ClipboardList,
    rows: [["Mileage", "Recorded"], ["Service", "Timeline"], ["Invoices", "Linked"]],
  },
];

function VehicleShowroom() {
  return (
    <div className="mkt-home__showcase" role="group" aria-label="Illustrative GarageOS vehicle and work order preview">
      <div className="mkt-home__showcase-top">
        <span className="mkt-home__window-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>GarageOS · Vehicle record</span>
        <span className="mkt-home__sample"><span /> Sample data</span>
      </div>
      <div className="mkt-home__vehicle-stage">
        <div className="mkt-home__stage-label">SERVICE HISTORY · VEHICLE VIEW</div>
        <svg className="mkt-home__vehicle-art" viewBox="0 0 800 330" role="img" aria-label="Illustrative side view of a passenger car">
          <defs>
            <linearGradient id="garage-car-body" x1="0" x2="0.15" y1="0" y2="1">
              <stop offset="0" stopColor="#f9fafb" />
              <stop offset="0.42" stopColor="#d8dde1" />
              <stop offset="1" stopColor="#929da5" />
            </linearGradient>
            <linearGradient id="garage-car-glass" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#64717a" />
              <stop offset="1" stopColor="#263138" />
            </linearGradient>
            <linearGradient id="garage-car-wheel" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#59636a" />
              <stop offset="1" stopColor="#20262b" />
            </linearGradient>
          </defs>
          <ellipse cx="401" cy="274" rx="306" ry="22" fill="#373e42" opacity="0.16" />
          <path d="M82 235c9-22 30-36 71-43l65-12 66-75c14-16 34-24 57-25h124c29 0 51 10 70 30l70 71 64 11c37 7 61 22 72 46l-5 19H86z" fill="url(#garage-car-body)" stroke="#89939a" strokeWidth="3" />
          <path d="m239 177 58-65c12-14 27-20 46-20h45v85z" fill="url(#garage-car-glass)" stroke="#f5f7f8" strokeWidth="5" />
          <path d="M401 92h61c22 0 39 8 54 25l54 60H401z" fill="url(#garage-car-glass)" stroke="#f5f7f8" strokeWidth="5" />
          <path d="M399 94v142m-162-49h367m-176 2v84" fill="none" stroke="#7e898f" strokeWidth="3" opacity="0.68" />
          <path d="M103 228c20-18 39-24 64-27m531 3c28 7 45 17 55 32" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.65" />
          <path d="M102 232h35m523 0h54" stroke="#f6c56f" strokeWidth="7" strokeLinecap="round" />
          <circle cx="235" cy="247" r="53" fill="#262c30" />
          <circle cx="235" cy="247" r="34" fill="url(#garage-car-wheel)" stroke="#aeb6bb" strokeWidth="5" />
          <circle cx="235" cy="247" r="12" fill="#d7dde0" />
          <circle cx="576" cy="247" r="53" fill="#262c30" />
          <circle cx="576" cy="247" r="34" fill="url(#garage-car-wheel)" stroke="#aeb6bb" strokeWidth="5" />
          <circle cx="576" cy="247" r="12" fill="#d7dde0" />
          <path d="M177 199h-26m478-4 41 7" stroke="#737d83" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <div className="mkt-home__stage-note mkt-home__stage-note--left">
          <small>WORK ORDER</small><strong>Brake inspection</strong><span>Example · awaiting review</span>
        </div>
        <div className="mkt-home__stage-note mkt-home__stage-note--right">
          <small>VEHICLE HISTORY</small><strong>Record linked</strong><span>Mileage · service notes</span>
        </div>
      </div>
      <div className="mkt-home__vehicle-meta" aria-label="Sample vehicle record fields">
        <span><small>Customer</small><strong>Linked to vehicle</strong></span>
        <span><small>Service</small><strong>Work recorded</strong></span>
        <span><small>History</small><strong>Ready to review</strong></span>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <main className="mkt-home">
      <section className="mkt-home__hero" id="top" aria-labelledby="home-title">
        <div className="mkt-home__hero-grid mkt-shell">
          <div className="mkt-home__intro">
            <span className="mkt-home__eyebrow"><span /> Built for the work happening in your garage</span>
            <h1 id="home-title">Every vehicle. Every job. <em>One clear view.</em></h1>
            <p className="mkt-home__lede">
              Keep the customer, vehicle, estimate, assigned mechanic, and invoice together — so every handoff starts with the right context.
            </p>
            <div className="mkt-home__actions">
              <a href={LIVE_DEMO_HREF} className="mkt-home__button mkt-home__button--dark">
                Explore the demo <ArrowRight size={17} aria-hidden="true" />
              </a>
              <a href={DEMO_HREF} className="mkt-home__button mkt-home__button--plain">Talk to our team</a>
            </div>
            <p className="mkt-home__note">A read-only preview with sample garage data. No account required.</p>
          </div>

          <VehicleShowroom />
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

      <section className="mkt-home__capability-section" id="product" aria-labelledby="capability-title">
        <div className="mkt-shell">
          <div className="mkt-home__section-heading">
            <span className="mkt-home__eyebrow"><span /> Less gets lost between handoffs</span>
            <h2 id="capability-title">Built around the details a service job depends on.</h2>
            <p>These previews use sample content to show how GarageOS connects the work from check-in through the vehicle record.</p>
          </div>
          <div className="mkt-home__capability-grid">
            {CAPABILITIES.map(({ id, label, title, detail, icon: Icon, rows }) => (
              <article className={`mkt-home__capability mkt-home__capability--${id}`} key={id}>
                <div className="mkt-home__capability-top">
                  <span className="mkt-home__capability-icon"><Icon size={18} aria-hidden="true" /></span>
                  <span>{label}</span>
                </div>
                <h3>{title}</h3>
                <p>{detail}</p>
                <div className="mkt-home__capability-preview" aria-hidden="true">
                  <span className="mkt-home__capability-preview-title">ILLUSTRATIVE WORKFLOW</span>
                  {rows.map(([name, value]) => (
                    <div className="mkt-home__capability-row" key={name}><span>{name}</span><strong>{value}</strong></div>
                  ))}
                </div>
              </article>
            ))}
          </div>
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
            <span className="mkt-home__eyebrow mkt-home__eyebrow--dark"><span /> Pricing for local service centers</span>
            <h2 id="closing-title">Choose a setup that fits your garage.</h2>
            <p>Talk with our team about rollout and pricing in UZS, or explore the sample workspace first.</p>
          </div>
          <div className="mkt-home__actions">
            <a href={DEMO_HREF} className="mkt-home__button mkt-home__button--green">Ask about pricing <ArrowRight size={17} aria-hidden="true" /></a>
            <a href={LIVE_DEMO_HREF} className="mkt-home__button mkt-home__button--light">Explore the sample workspace</a>
          </div>
        </div>
      </section>
    </main>
  );
}
