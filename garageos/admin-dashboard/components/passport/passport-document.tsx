import { Fragment, type CSSProperties } from "react";
import type { HealthBand, Passport } from "@/lib/api/types";
import { translate, type Locale } from "@/lib/i18n/dictionaries";
import "./passport.css";

// ─── Derivations ──────────────────────────────────────────────
const ACCENT: Record<HealthBand, { accent: string; soft: string }> = {
  excellent: { accent: "#0E8A5F", soft: "#E8F2EC" },
  good: { accent: "#1F6FEB", soft: "#E7EEFC" },
  fair: { accent: "#B07A22", soft: "#F6EEDD" },
  poor: { accent: "#B4442E", soft: "#F7E5E1" },
};

const GRADE: Record<HealthBand, string> = {
  excellent: "passport.grade.excellent", good: "passport.grade.good", fair: "passport.grade.fair", poor: "passport.grade.poor",
};

function assessment(p: Passport, locale: Locale): { lead: string; rest: string } {
  const { band, compliance, urgent_count } = p.health;
  return {
    lead: translate(locale, `passport.assessment.${band}.lead`),
    rest: translate(locale, `passport.assessment.${band}.rest`, { compliance, count: urgent_count }),
  };
}

const nf = (n: number, locale: Locale) => n.toLocaleString(locale);
const shortDate = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
const monthYear = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleDateString(locale, { month: "short", year: "numeric" });

function monogram(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 1).map((w) => w[0]?.toUpperCase()).join("") || "G";
}
function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "•";
}
function remaining(u: Passport["upcoming"][number], locale: Locale): string {
  if (u.remaining_km != null && u.remaining_km > 0) return translate(locale, "passport.remaining_km", { count: nf(u.remaining_km, locale) });
  if (u.remaining_km != null && u.remaining_km <= 0) return translate(locale, "passport.overdue");
  if (u.remaining_days != null) return translate(locale, "passport.remaining_days", { count: u.remaining_days });
  return translate(locale, "passport.scheduled");
}
const PILL: Record<string, string> = { on_track: "pp-on", due_soon: "pp-soon", overdue: "pp-over" };

// ─── Component ────────────────────────────────────────────────
export function PassportDocument({
  passport,
  qrSvg,
  verifyUrl,
  locale,
}: {
  passport: Passport;
  qrSvg: string;
  verifyUrl: string;
  locale: Locale;
}) {
  const p = passport;
  const band = p.health.band;
  const { accent, soft } = ACCENT[band];
  const a = assessment(p, locale);
  const v = p.vehicle;
  const sub = [v.year, v.transmission, v.engine_type, v.color].filter(Boolean).join(" · ");
  const owner = p.owner_name ?? translate(locale, "passport.record");
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
            <p>{p.garage.tagline ?? p.garage.address ?? translate(locale, "passport.service_advisor")}</p>
            </div>
          </div>
          <div className="pp-mastR">
            <div className="pp-over">{translate(locale, "passport.record")}</div>
            <div className="pp-no">{translate(locale, "passport.record_no")} {p.code}</div>
          </div>
        </div>
        <div className="pp-rule" />
        <div className="pp-passtitle">
          <div className="pp-k">{translate(locale, "passport.record").toLocaleUpperCase(locale)}</div>
          <div className="pp-t pp-disp">{translate(locale, "passport.title")}</div>
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
          <div className="pp-lbl">{translate(locale, "passport.health")}</div>
          <div className="pp-score pp-disp">{Math.round(p.health.score)}<sup>/100</sup></div>
          <div className="pp-grade pp-disp">{translate(locale, GRADE[band])}</div>
        </div>

        {/* Maintenance compliance */}
        <div className="pp-comp">
          <div className="pp-cl">{translate(locale, "passport.compliance")}</div>
          <div className="pp-track"><div className="pp-fill" style={{ width: `${p.health.compliance}%` }} /></div>
          <div className="pp-cv">{p.health.compliance}%</div>
          <div className="pp-cap">{translate(locale, "passport.compliance_caption")}</div>
        </div>

        {/* Trust */}
        <div className="pp-trust">
          <div className="pp-by">{translate(locale, "passport.recorded_by", { garage: p.garage.name })}</div>
          {p.highlights.slice(0, 3).map((h) => (
            <div key={h.label} className="pp-v">
              <span className={`pp-tick${h.ok ? "" : " pp-off"}`}>{h.ok ? "✓" : "–"}</span> {h.label}
            </div>
          ))}
        </div>

        {/* Service history */}
        {p.history.length > 0 && (
          <>
            <div className="pp-sechead"><span className="pp-over">{translate(locale, "passport.history")}</span><span className="pp-ln" /></div>
            <div className="pp-cards">
              {p.history.map((h, i) => (
                <div key={i} className="pp-scard">
                  <div className="pp-ok">✓</div>
                  <div className="pp-st">{translate(locale, "passport.completed")}</div>
                  <div className="pp-ti">{h.service_type}</div>
                  <div className="pp-dt">{shortDate(h.date, locale)}{h.km != null ? ` · ${translate(locale, "passport.in_km", { count: nf(h.km, locale) })}` : ""}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Upcoming + Highlights */}
        <div className="pp-two">
          <div className="pp-col">
            <h4>{translate(locale, "passport.upcoming")}</h4>
            {p.upcoming.map((u, i) => (
              <div key={i} className="pp-due">
                <span className={`pp-pill ${PILL[u.status]}`}>{translate(locale, `passport.due.${u.status === "on_track" ? "on_track" : u.status === "due_soon" ? "soon" : "overdue"}`)}</span>
                {u.service_type} · {remaining(u, locale)}
              </div>
            ))}
          </div>
          <div className="pp-col">
            <h4>{translate(locale, "passport.highlights")}</h4>
            {p.highlights.map((h) => (
              <div key={h.label} className="pp-hi">
                <span className={`pp-tick${h.ok ? "" : " pp-off"}`}>{h.ok ? "✓" : "–"}</span> {h.label}
              </div>
            ))}
          </div>
        </div>

        {/* Technician's assessment */}
        <div className="pp-ai">
          <div className="pp-h pp-over">✦ {translate(locale, "passport.assessment")}</div>
          <p className="pp-notes"><b>{a.lead}</b>{a.rest}</p>
        </div>

        {/* Ownership timeline */}
        <div className="pp-sechead"><span className="pp-over">{translate(locale, "passport.timeline")}</span><span className="pp-ln" /></div>
        <Timeline passport={p} locale={locale} />

        {/* Footer */}
        <div className="pp-foot">
          <div className="pp-qrbox">
            <div className="pp-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="pp-qrt">
              <div className="pp-over">{translate(locale, "passport.scan_open")}</div>
              <div className="pp-u">{verifyHost}</div>
              <div className="pp-m"><span className="pp-avatar">{initials(owner)}</span>{translate(locale, "passport.live_record", { owner })}</div>
            </div>
          </div>
          <div className="pp-sign">
            <div className="pp-sig">{p.garage.name}</div>
            <div className="pp-sln" />
            <div className="pp-role">{translate(locale, "passport.service_advisor")}</div>
            <div className="pp-cap">{translate(locale, "passport.recorded_by", { garage: p.garage.name })}</div>
          </div>
          <div className="pp-seal">
            <div className="pp-s1">{translate(locale, "passport.record").toLocaleUpperCase(locale)}</div>
            <div className="pp-s2 pp-disp">{translate(locale, GRADE[band]).toLocaleUpperCase(locale)}</div>
            <div className="pp-s3">{monthYear(p.issued_at, locale).toLocaleUpperCase(locale)}</div>
          </div>
        </div>

        <div className="pp-holo" />
        <div className="pp-micro">
          {`${p.garage.name} · ${translate(locale, "passport.record_copy")} · ${p.code} · `.repeat(6)}
        </div>
        <div className="pp-legal">
          <span>{translate(locale, "passport.issued")} {shortDate(p.issued_at, locale)} · {p.garage.name}</span>
          <span>{translate(locale, "passport.record_no")} {p.code} · {translate(locale, "passport.provided_by")}</span>
        </div>
      </div>
    </div>
  );
}

function Timeline({ passport, locale }: { passport: Passport; locale: Locale }) {
  // Build a compact flow: registered → recent services → today.
  const hist = [...passport.history].reverse(); // oldest first
  const steps: { title: string; date: string; kind: "mut" | "" | "now" }[] = [];
  steps.push({ title: translate(locale, "passport.registered"), date: `${passport.vehicle.year}`, kind: "mut" });
  hist.slice(-3).forEach((h) => steps.push({ title: h.service_type, date: monthYear(h.date, locale), kind: "" }));
  steps.push({ title: translate(locale, "passport.today"), date: monthYear(passport.issued_at, locale), kind: "now" });

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
