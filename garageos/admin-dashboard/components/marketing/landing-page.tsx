import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Car,
  Check,
  Gauge,
  Inbox,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  Siren,
  Sparkles,
} from "lucide-react";

import { DEMO_HREF, LIVE_DEMO_HREF, SIGN_IN_HREF } from "@/components/marketing/chrome";

const PILLARS = [
  { icon: Gauge, gold: true, title: "Vehicle Intelligence", body: "A living digital twin of every vehicle — health, predicted failures, service history, and a certified passport, composed from real data." },
  { icon: CalendarClock, title: "Scheduling board", body: "A drag-and-drop day board across mechanic lanes with live occupancy, collision detection, and one-click lifecycle actions." },
  { icon: Siren, title: "Operations & dispatch", body: "Emergencies, tows, and roadside calls become tracked cases with SLA timers, assignment, and live customer status." },
  { icon: Inbox, title: "Unified inbox", body: "Every conversation — Telegram, walk-in, internal note — in one thread, linked to the vehicle, case, and invoice." },
  { icon: ReceiptText, title: "Estimates & billing", body: "Estimates customers approve from their phone, invoices, payments, and a ledger that always reconciles." },
  { icon: BarChart3, title: "Reports that decide", body: "Revenue, receivables, collection rate, conversion, and fleet health — projected over one auditable event stream." },
];

const SPOTS = [
  {
    eyebrow: "The intelligence layer",
    title: "Know a vehicle's future before it's on the lift",
    body: "The Vehicle Intelligence Center reads health, maintenance, and history into one cinematic view — with deterministic predictions, not guesswork. Your advisors walk in already knowing what to recommend.",
    img: "/marketing/vehicle-health.png",
    alt: "Vehicle Intelligence Center showing health score, subsystems, and predictions",
    points: ["Per-subsystem health with clickable hotspots", "Next-service and breakdown-risk predictions", "A shareable Certified Vehicle Passport with QR"],
    reverse: false,
  },
  {
    eyebrow: "Run the floor",
    title: "A control room for a busy shop",
    body: "See every mechanic lane, every appointment, and every live case at a glance. Move work with a drag, resolve conflicts inline, and keep the whole team on one real-time picture.",
    img: "/marketing/calendar.png",
    alt: "Scheduling board with mechanic lanes and live appointments",
    points: ["Drag-to-move with collision detection", "Live occupancy per mechanic", "Confirm, start, and complete in one click"],
    reverse: true,
  },
];

export function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="mkt-section mkt-hero" id="top">
        <div className="mkt-hero__glow" aria-hidden />
        <div className="mkt-grid-overlay" aria-hidden />
        <div className="mkt-shell mkt-hero__inner">
          <span className="mkt-eyebrow mkt-rise mkt-rise-1"><span className="mkt-eyebrow__dot" /> The operating system for modern garages</span>
          <h1 className="mkt-display mkt-hero__title mkt-rise mkt-rise-2">
            Run your garage on <span className="mkt-accent">intelligence</span>, not paperwork
          </h1>
          <p className="mkt-hero__sub mkt-rise mkt-rise-3">
            GarageOS unifies scheduling, vehicle health, operations, billing, and customer messaging
            into one platform — so every job, every car, and every dollar is in one place.
          </p>
          <div className="mkt-hero__cta mkt-rise mkt-rise-4">
            <a href={LIVE_DEMO_HREF} className="mkt-btn mkt-btn--primary mkt-btn--lg">Explore the live demo <ArrowRight size={17} /></a>
            <a href={DEMO_HREF} className="mkt-btn mkt-btn--ghost mkt-btn--lg">Book a demo</a>
          </div>
          <p className="mkt-hero__trust mkt-rise mkt-rise-4">No signup — a read-only tour on real demo data.</p>

          <div className="mkt-frame mkt-rise mkt-rise-4">
            <div className="mkt-frame__dots" aria-hidden><i /><i /><i /></div>
            <img src="/marketing/dashboard.png" alt="GarageOS dashboard showing appointments, fleet health, and revenue" width={1080} height={675} fetchPriority="high" />
          </div>
        </div>
      </section>

      {/* Positioning strip */}
      <div className="mkt-strip">
        <div className="mkt-shell mkt-strip__row">
          <span className="mkt-strip__label">One platform for</span>
          <span className="mkt-strip__item">Service centers</span>
          <span className="mkt-strip__item">Roadside & towing</span>
          <span className="mkt-strip__item">Fleet maintenance</span>
          <span className="mkt-strip__item">Multi-brand groups</span>
        </div>
      </div>

      {/* Pillars bento */}
      <section className="mkt-section" id="features">
        <div className="mkt-shell">
          <div className="mkt-section__head">
            <span className="mkt-eyebrow"><span className="mkt-eyebrow__dot" /> Everything the shop runs on</span>
            <h2 className="mkt-display mkt-h2">The whole operation, on one system</h2>
            <p className="mkt-lede">No more juggling a calendar, a spreadsheet, a chat app, and a shoebox of invoices. GarageOS connects them — every action flows through one event stream.</p>
          </div>
          <div className="mkt-bento">
            {PILLARS.map(({ icon: Icon, title, body, gold }) => (
              <article className="mkt-card" key={title}>
                <div className={`mkt-card__icon${gold ? " mkt-card__icon--gold" : ""}`}><Icon size={22} /></div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Spotlights */}
      <section className="mkt-section">
        <div className="mkt-shell">
          {SPOTS.map((s) => (
            <div className={`mkt-spot${s.reverse ? " mkt-spot--reverse" : ""}`} key={s.title}>
              <div className="mkt-spot__body">
                <span className="mkt-eyebrow"><span className="mkt-eyebrow__dot" /> {s.eyebrow}</span>
                <h3 className="mkt-display">{s.title}</h3>
                <p>{s.body}</p>
                <ul className="mkt-spot__list">
                  {s.points.map((p) => (<li key={p}><Check size={17} /> {p}</li>))}
                </ul>
              </div>
              <div className="mkt-shot">
                <img src={s.img} alt={s.alt} width={720} height={450} loading="lazy" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Platform / composability band */}
      <section className="mkt-section mkt-band" id="platform">
        <div className="mkt-shell">
          <div className="mkt-section__head">
            <span className="mkt-eyebrow"><span className="mkt-eyebrow__dot" /> Built as a platform</span>
            <h2 className="mkt-display mkt-h2">One data model. Every workflow connected.</h2>
            <p className="mkt-lede">A roadside call opens a case, notifies the team, and lands in the same inbox as a walk-in. A completed job updates the vehicle{"’"}s health and its invoice. Nothing is bolted on — it{"’"}s one system.</p>
          </div>
          <div className="mkt-stats">
            <div><div className="mkt-stat__n mkt-accent">Multi-tenant</div><div className="mkt-stat__l">White-label per garage, isolated by design</div></div>
            <div><div className="mkt-stat__n mkt-accent">Real-time</div><div className="mkt-stat__l">Live boards, cases, and notifications</div></div>
            <div><div className="mkt-stat__n mkt-accent">3 languages</div><div className="mkt-stat__l">English, Russian, Uzbek — customer-ready</div></div>
            <div><div className="mkt-stat__n mkt-accent">In Telegram</div><div className="mkt-stat__l">A customer app with zero install</div></div>
          </div>
          <div className="mkt-bento" style={{ marginTop: 40 }}>
            <article className="mkt-card"><div className="mkt-card__icon"><MessageCircle size={22} /></div><h3>Customers in Telegram</h3><p>Owners see their vehicle, approve estimates, message the shop, and call for roadside help — no app store, no friction.</p></article>
            <article className="mkt-card"><div className="mkt-card__icon mkt-card__icon--gold"><ShieldCheck size={22} /></div><h3>Secure by default</h3><p>Tenant isolation, rate-limited auth, an append-only audit trail, and automated backups — built for real customer data.</p></article>
            <article className="mkt-card"><div className="mkt-card__icon"><Car size={22} /></div><h3>Made for the trade</h3><p>Health scoring, maintenance rules, and passports speak the language of a workshop — not a generic CRM bent to fit.</p></article>
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="mkt-section" id="pricing">
        <div className="mkt-shell">
          <div className="mkt-section__head">
            <span className="mkt-eyebrow"><span className="mkt-eyebrow__dot" /> Pricing</span>
            <h2 className="mkt-display mkt-h2">Simple plans that grow with the shop</h2>
            <p className="mkt-lede">Start with what one location needs and scale to a whole group. See the full breakdown, or book a demo and we{"’"}ll tailor a plan to your operation.</p>
          </div>
          <div className="mkt-hero__cta" style={{ justifyContent: "flex-start", marginTop: 28 }}>
            <a href="/pricing" className="mkt-btn mkt-btn--primary mkt-btn--lg">See full pricing <ArrowRight size={17} /></a>
            <a href={DEMO_HREF} className="mkt-btn mkt-btn--ghost mkt-btn--lg">Book a demo</a>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mkt-section" style={{ paddingTop: 0 }}>
        <div className="mkt-shell">
          <div className="mkt-cta">
            <span className="mkt-eyebrow"><Sparkles size={14} /> See it on real data</span>
            <h2 className="mkt-display" style={{ marginTop: 18 }}>Give your garage its operating system</h2>
            <p>Explore the whole platform right now on a fully-loaded demo shop — no signup — or book a 20-minute walkthrough tailored to your operation.</p>
            <div className="mkt-hero__cta" style={{ marginTop: 28 }}>
              <a href={LIVE_DEMO_HREF} className="mkt-btn mkt-btn--primary mkt-btn--lg">Explore the live demo <ArrowRight size={17} /></a>
              <a href={DEMO_HREF} className="mkt-btn mkt-btn--ghost mkt-btn--lg">Book a demo</a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
