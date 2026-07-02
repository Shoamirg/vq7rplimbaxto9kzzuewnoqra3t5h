import { Fragment, type CSSProperties } from "react";
import type { HealthBand, Passport } from "@/lib/api/types";
import "./passport.css";

// ─── Derivations ──────────────────────────────────────────────
const ACCENT: Record<HealthBand, { accent: string; soft: string }> = {
  excellent: { accent: "#0E8A5F", soft: "#E8F2EC" },
  good: { accent: "#1F6FEB", soft: "#E7EEFC" },
  fair: { accent: "#B07A22", soft: "#F6EEDD" },
  poor: { accent: "#B4442E", soft: "#F7E5E1" },
};

const TIER: Record<HealthBand, { label: string; stars: number }> = {
  excellent: { label: "Platinum Certified", stars: 5 },
  good: { label: "Gold Certified", stars: 4 },
  fair: { label: "Silver Certified", stars: 3 },
  poor: { label: "Provisional", stars: 0 },
};

const GRADE: Record<HealthBand, string> = {
  excellent: "Excellent", good: "Good", fair: "Fair", poor: "Needs Attention",
};

function assessment(p: Passport): { lead: string; rest: string } {
  const { band, compliance, urgent_count } = p.health;
  const model = `${p.vehicle.brand} ${p.vehicle.model}`;
  if (band === "excellent")
    return {
      lead: "This vehicle has been exceptionally well maintained.",
      rest: ` Every scheduled service has been completed on time, with a complete and unbroken record, and no critical systems currently require attention. Based on its service history, consistent mileage, and current condition, the ${model} is expected to remain in excellent operating condition with routine maintenance.`,
    };
  if (band === "good")
    return {
      lead: "This vehicle is in good, dependable condition.",
      rest: ` It carries a solid service record with ${compliance}% of scheduled maintenance kept up to date. A small number of items are approaching their service window; staying on the current cadence will keep the ${model} performing reliably.`,
    };
  if (band === "fair")
    return {
      lead: "This vehicle is roadworthy but would benefit from attention.",
      rest: ` Several services are approaching or just past their recommended interval${urgent_count ? ` (${urgent_count} needing action)` : ""}. Addressing them will restore the ${model}'s health rating and protect its long-term reliability.`,
    };
  return {
    lead: "This vehicle needs care to return to good health.",
    rest: ` ${urgent_count} service${urgent_count === 1 ? " is" : "s are"} overdue and should be scheduled soon to prevent avoidable wear. Once brought current, the ${model} can quickly recover a strong health rating.`,
  };
}

const nf = (n: number) => n.toLocaleString("en-US");
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
const monthYear = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });

function monogram(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 1).map((w) => w[0]?.toUpperCase()).join("") || "G";
}
function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "•";
}
function remaining(u: Passport["upcoming"][number]): string {
  if (u.remaining_km != null && u.remaining_km > 0) return `in ${nf(u.remaining_km)} km`;
  if (u.remaining_km != null && u.remaining_km <= 0) return "overdue";
  if (u.remaining_days != null) return `in ${u.remaining_days} days`;
  return "scheduled";
}
const PILL: Record<string, string> = { on_track: "pp-on", due_soon: "pp-soon", overdue: "pp-over" };
const PILL_TEXT: Record<string, string> = { on_track: "On track", due_soon: "Due soon", overdue: "Overdue" };

// ─── Component ────────────────────────────────────────────────
export function PassportDocument({
  passport,
  qrSvg,
  verifyUrl,
}: {
  passport: Passport;
  qrSvg: string;
  verifyUrl: string;
}) {
  const p = passport;
  const band = p.health.band;
  const { accent, soft } = ACCENT[band];
  const tier = TIER[band];
  const a = assessment(p);
  const v = p.vehicle;
  const sub = [v.year, v.transmission, v.engine_type, v.color].filter(Boolean).join(" · ");
  const owner = p.owner_name ?? "Vehicle Owner";
  const rootStyle = { "--accent": accent, "--accent-soft": soft } as CSSProperties;
  const verifyHost = verifyUrl.replace(/^https?:\/\//, "");

  return (
    <div className="pp-root" style={rootStyle}>
      <div className="pp-frame" />
      <div className="pp-wm" />
      <div className="pp-corner pp-tl" /><div className="pp-corner pp-tr" />
      <div className="pp-corner pp-bl" /><div className="pp-corner pp-br" />

      <div className="pp-rel">
        {/* Masthead */}
        <div className="pp-mast">
          <div className="pp-brand">
            <div className="pp-mono">{p.garage.monogram ?? monogram(p.garage.name)}</div>
            <div>
              <h1>{p.garage.name.toUpperCase()}</h1>
              <p>{p.garage.tagline ?? p.garage.address ?? "Certified Service Centre"}</p>
            </div>
          </div>
          <div className="pp-mastR">
            <div className="pp-over">Digitally Certified</div>
            <div className="pp-no">No. {p.code}</div>
          </div>
        </div>
        <div className="pp-rule" />
        <div className="pp-passtitle">
          <div className="pp-k">CERTIFIED</div>
          <div className="pp-t pp-disp">Vehicle&nbsp;Passport</div>
        </div>

        {/* Vehicle + silhouette */}
        <div className="pp-veh">
          <div>
            <div className="pp-name pp-disp">{v.brand} {v.model}</div>
            <div className="pp-sub">{sub}</div>
            {v.license_plate && <span className="pp-plate">{v.license_plate}</span>}
          </div>
          <svg className="pp-silo" width="300" height="118" viewBox="0 0 300 118" fill="none" aria-hidden>
            <g stroke="#15120C" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" fill="#15120C" fillOpacity="0.05">
              <path d="M18 84 L30 84 C34 66 44 58 62 57 L96 55 C108 44 124 36 150 35 L206 36 C226 37 240 46 250 58 L272 62 C282 64 286 70 286 80 L286 84 L268 84" />
              <path d="M104 55 L118 40 L168 39 L172 54 Z" fillOpacity="0.09" />
              <path d="M180 54 L176 39 L206 40 C220 41 232 47 240 55 Z" fillOpacity="0.09" />
            </g>
            <circle cx="72" cy="84" r="17" fill="#fff" stroke="#15120C" strokeWidth="2.4" />
            <circle cx="72" cy="84" r="7" fill="#15120C" fillOpacity="0.15" stroke="#15120C" strokeWidth="1.6" />
            <circle cx="238" cy="84" r="17" fill="#fff" stroke="#15120C" strokeWidth="2.4" />
            <circle cx="238" cy="84" r="7" fill="#15120C" fillOpacity="0.15" stroke="#15120C" strokeWidth="1.6" />
          </svg>
        </div>

        {/* Health hero */}
        <div className="pp-hero">
          <div className="pp-lbl">VEHICLE&nbsp;HEALTH</div>
          <div className="pp-score pp-disp">{Math.round(p.health.score)}<sup>/100</sup></div>
          <div className="pp-grade pp-disp">{GRADE[band]}</div>
          {tier.stars > 0 && (
            <div className="pp-badge">
              <span>◆</span> {tier.label}
              <span className="pp-stars">{"★".repeat(tier.stars)}</span>
            </div>
          )}
        </div>

        {/* Maintenance compliance */}
        <div className="pp-comp">
          <div className="pp-cl">Maintenance Compliance</div>
          <div className="pp-track"><div className="pp-fill" style={{ width: `${p.health.compliance}%` }} /></div>
          <div className="pp-cv">{p.health.compliance}%</div>
          <div className="pp-cap">Manufacturer-recommended schedule adherence</div>
        </div>

        {/* Trust */}
        <div className="pp-trust">
          <div className="pp-by">Verified by {p.garage.name}</div>
          {p.highlights.slice(0, 3).map((h) => (
            <div key={h.label} className="pp-v">
              <span className={`pp-tick${h.ok ? "" : " pp-off"}`}>{h.ok ? "✓" : "–"}</span> {h.label}
            </div>
          ))}
        </div>

        {/* Service history */}
        {p.history.length > 0 && (
          <>
            <div className="pp-sechead"><span className="pp-over">Service History</span><span className="pp-ln" /></div>
            <div className="pp-cards">
              {p.history.map((h, i) => (
                <div key={i} className="pp-scard">
                  <div className="pp-ok">✓</div>
                  <div className="pp-st">Completed</div>
                  <div className="pp-ti">{h.service_type}</div>
                  <div className="pp-dt">{shortDate(h.date)}{h.km != null ? ` · ${nf(h.km)} km` : ""}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Upcoming + Highlights */}
        <div className="pp-two">
          <div className="pp-col">
            <h4>Upcoming Maintenance</h4>
            {p.upcoming.map((u, i) => (
              <div key={i} className="pp-due">
                <span className={`pp-pill ${PILL[u.status]}`}>{PILL_TEXT[u.status]}</span>
                {u.service_type} · {remaining(u)}
              </div>
            ))}
          </div>
          <div className="pp-col">
            <h4>Vehicle Highlights</h4>
            {p.highlights.map((h) => (
              <div key={h.label} className="pp-hi">
                <span className={`pp-tick${h.ok ? "" : " pp-off"}`}>{h.ok ? "✓" : "–"}</span> {h.label}
              </div>
            ))}
          </div>
        </div>

        {/* Technician's assessment */}
        <div className="pp-ai">
          <div className="pp-h pp-over">✦ Technician&apos;s Assessment</div>
          <p className="pp-notes"><b>{a.lead}</b>{a.rest}</p>
        </div>

        {/* Ownership timeline */}
        <div className="pp-sechead"><span className="pp-over">Ownership Timeline</span><span className="pp-ln" /></div>
        <Timeline passport={p} />

        {/* Footer */}
        <div className="pp-foot">
          <div className="pp-qrbox">
            <div className="pp-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="pp-qrt">
              <div className="pp-over">Scan to Verify Authenticity</div>
              <div className="pp-u">{verifyHost}</div>
              <div className="pp-m"><span className="pp-avatar">{initials(owner)}</span>{owner} · live report, always current</div>
            </div>
          </div>
          <div className="pp-sign">
            <div className="pp-sig">{p.garage.name}</div>
            <div className="pp-sln" />
            <div className="pp-role">Chief Service Advisor</div>
            <div className="pp-cap">Digitally verified</div>
          </div>
          <div className="pp-seal">
            <div className="pp-s1">CERTIFIED</div>
            <div className="pp-s2 pp-disp">{band === "poor" ? "ON FILE" : "HEALTHY"}</div>
            <div className="pp-s3">{monthYear(p.issued_at).toUpperCase()}</div>
          </div>
        </div>

        <div className="pp-holo" />
        <div className="pp-micro">
          {`${p.garage.name} · Certified Vehicle Passport · Authentic · ${p.code} · `.repeat(6)}
        </div>
        <div className="pp-legal">
          <span>Issued {shortDate(p.issued_at)} · {p.garage.name} · Digitally signed</span>
          <span>Passport No. {p.code} · Powered by GarageOS</span>
        </div>
      </div>
    </div>
  );
}

function Timeline({ passport }: { passport: Passport }) {
  // Build a compact flow: registered → recent services → today.
  const hist = [...passport.history].reverse(); // oldest first
  const steps: { title: string; date: string; kind: "mut" | "" | "now" }[] = [];
  steps.push({ title: "Registered", date: `${passport.vehicle.year}`, kind: "mut" });
  hist.slice(-3).forEach((h) => steps.push({ title: h.service_type, date: monthYear(h.date), kind: "" }));
  steps.push({ title: "Today", date: monthYear(passport.issued_at), kind: "now" });

  return (
    <div className="pp-flowtrack">
      {steps.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="pp-arrow">→</span>}
          <div className={`pp-step ${s.kind ? `pp-${s.kind}` : ""}`}>
            <div className="pp-node" />
            <div className="pp-tt">{s.title}</div>
            <div className="pp-dd">{s.date}</div>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
