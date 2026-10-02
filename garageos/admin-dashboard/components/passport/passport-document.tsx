"use client";

import { Fragment, type CSSProperties } from "react";
import type { HealthBand, Passport } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import "./passport.css";

// Translator function shapes (mirrors useI18n's t / tp) so the module-scope
// helpers below can stay pure and receive the translator from the component.
type Tr = (key: string, params?: Record<string, string | number>) => string;
type Tpl = (key: string, count: number, params?: Record<string, string | number>) => string;

// ─── Derivations ──────────────────────────────────────────────
const ACCENT: Record<HealthBand, { accent: string; soft: string }> = {
  excellent: { accent: "#0E8A5F", soft: "#E8F2EC" },
  good: { accent: "#1F6FEB", soft: "#E7EEFC" },
  fair: { accent: "#B07A22", soft: "#F6EEDD" },
  poor: { accent: "#B4442E", soft: "#F7E5E1" },
};

// Star count per band; the human-readable tier label is translated via
// `t("pass.tier.<band>")` at the call site.
const TIER: Record<HealthBand, { stars: number }> = {
  excellent: { stars: 5 },
  good: { stars: 4 },
  fair: { stars: 3 },
  poor: { stars: 0 },
};

function assessment(p: Passport, t: Tr, tp: Tpl): { lead: string; rest: string } {
  const { band, compliance, urgent_count } = p.health;
  const model = `${p.vehicle.brand} ${p.vehicle.model}`;
  if (band === "excellent")
    return {
      lead: t("pass.assess.excellent.lead"),
      rest: t("pass.assess.excellent.rest", { model }),
    };
  if (band === "good")
    return {
      lead: t("pass.assess.good.lead"),
      rest: t("pass.assess.good.rest", { compliance, model }),
    };
  if (band === "fair") {
    const urgent = urgent_count ? t("pass.assess.fair.urgent", { count: urgent_count }) : "";
    return {
      lead: t("pass.assess.fair.lead"),
      rest: t("pass.assess.fair.rest", { urgent, model }),
    };
  }
  return {
    lead: t("pass.assess.poor.lead"),
    rest: tp("pass.assess.poor.rest", urgent_count, { model }),
  };
}

// Number/date formatters bound to the active UI language.
function useFmt() {
  const { locale } = useI18n();
  return {
    nf: (n: number) => formatNumber(locale, n),
    shortDate: (iso: string) =>
      formatDate(locale, iso, { day: "numeric", month: "short", year: "numeric" }),
    monthYear: (iso: string) =>
      formatDate(locale, iso, { month: "short", year: "numeric" }),
  };
}

function monogram(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 1).map((w) => w[0]?.toUpperCase()).join("") || "G";
}
function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "•";
}
function remaining(u: Passport["upcoming"][number], t: Tr, nf: (n: number) => string): string {
  if (u.remaining_km != null && u.remaining_km > 0) return t("pass.remaining.km", { km: nf(u.remaining_km) });
  if (u.remaining_km != null && u.remaining_km <= 0) return t("pass.remaining.overdue");
  if (u.remaining_days != null) return t("pass.remaining.days", { days: u.remaining_days });
  return t("pass.remaining.scheduled");
}
const PILL: Record<string, string> = { on_track: "pp-on", due_soon: "pp-soon", overdue: "pp-over" };

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
  const { t, tp } = useI18n();
  const { nf, shortDate, monthYear } = useFmt();
  const p = passport;
  const band = p.health.band;
  const { accent, soft } = ACCENT[band];
  const tier = TIER[band];
  const a = assessment(p, t, tp);
  const v = p.vehicle;
  const sub = [v.year, v.transmission, v.engine_type, v.color].filter(Boolean).join(" · ");
  const owner = p.owner_name ?? t("pass.vehicle_owner");
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
              <p>{p.garage.tagline ?? p.garage.address ?? t("pass.service_centre")}</p>
            </div>
          </div>
          <div className="pp-mastR">
            <div className="pp-over">{t("pass.digitally_certified")}</div>
            <div className="pp-no">{t("pass.no")} {p.code}</div>
          </div>
        </div>
        <div className="pp-rule" />
        <div className="pp-passtitle">
          <div className="pp-k">{t("pass.certified")}</div>
          <div className="pp-t pp-disp">{t("pass.vehicle_passport")}</div>
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
          <div className="pp-lbl">{t("pass.vehicle_health")}</div>
          <div className="pp-score pp-disp">{Math.round(p.health.score)}<sup>/100</sup></div>
          <div className="pp-grade pp-disp">{t(`pass.grade.${band}`)}</div>
          {tier.stars > 0 && (
            <div className="pp-badge">
              <span>◆</span> {t(`pass.tier.${band}`)}
              <span className="pp-stars">{"★".repeat(tier.stars)}</span>
            </div>
          )}
        </div>

        {/* Maintenance compliance */}
        <div className="pp-comp">
          <div className="pp-cl">{t("pass.compliance_label")}</div>
          <div className="pp-track"><div className="pp-fill" style={{ width: `${p.health.compliance}%` }} /></div>
          <div className="pp-cv">{p.health.compliance}%</div>
          <div className="pp-cap">{t("pass.compliance_cap")}</div>
        </div>

        {/* Trust */}
        <div className="pp-trust">
          <div className="pp-by">{t("pass.verified_by", { garage: p.garage.name })}</div>
          {p.highlights.slice(0, 3).map((h) => (
            <div key={h.label} className="pp-v">
              <span className={`pp-tick${h.ok ? "" : " pp-off"}`}>{h.ok ? "✓" : "–"}</span> {h.label}
            </div>
          ))}
        </div>

        {/* Service history */}
        {p.history.length > 0 && (
          <>
            <div className="pp-sechead"><span className="pp-over">{t("pass.service_history")}</span><span className="pp-ln" /></div>
            <div className="pp-cards">
              {p.history.map((h, i) => (
                <div key={i} className="pp-scard">
                  <div className="pp-ok">✓</div>
                  <div className="pp-st">{t("pass.completed")}</div>
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
            <h4>{t("pass.upcoming")}</h4>
            {p.upcoming.map((u, i) => (
              <div key={i} className="pp-due">
                <span className={`pp-pill ${PILL[u.status]}`}>{t(`pass.pill.${u.status}`)}</span>
                {u.service_type} · {remaining(u, t, nf)}
              </div>
            ))}
          </div>
          <div className="pp-col">
            <h4>{t("pass.highlights")}</h4>
            {p.highlights.map((h) => (
              <div key={h.label} className="pp-hi">
                <span className={`pp-tick${h.ok ? "" : " pp-off"}`}>{h.ok ? "✓" : "–"}</span> {h.label}
              </div>
            ))}
          </div>
        </div>

        {/* Technician's assessment */}
        <div className="pp-ai">
          <div className="pp-h pp-over">✦ {t("pass.tech_assessment")}</div>
          <p className="pp-notes"><b>{a.lead}</b>{a.rest}</p>
        </div>

        {/* Ownership timeline */}
        <div className="pp-sechead"><span className="pp-over">{t("pass.ownership_timeline")}</span><span className="pp-ln" /></div>
        <Timeline passport={p} />

        {/* Footer */}
        <div className="pp-foot">
          <div className="pp-qrbox">
            <div className="pp-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="pp-qrt">
              <div className="pp-over">{t("pass.scan_verify")}</div>
              <div className="pp-u">{verifyHost}</div>
              <div className="pp-m"><span className="pp-avatar">{initials(owner)}</span>{owner} · {t("pass.live_report")}</div>
            </div>
          </div>
          <div className="pp-sign">
            <div className="pp-sig">{p.garage.name}</div>
            <div className="pp-sln" />
            <div className="pp-role">{t("pass.chief_advisor")}</div>
            <div className="pp-cap">{t("pass.digitally_verified")}</div>
          </div>
          <div className="pp-seal">
            <div className="pp-s1">{t("pass.certified")}</div>
            <div className="pp-s2 pp-disp">{band === "poor" ? t("pass.seal_onfile") : t("pass.seal_healthy")}</div>
            <div className="pp-s3">{monthYear(p.issued_at).toUpperCase()}</div>
          </div>
        </div>

        <div className="pp-holo" />
        <div className="pp-micro">
          {`${p.garage.name} · ${t("pass.micro")} · ${p.code} · `.repeat(6)}
        </div>
        <div className="pp-legal">
          <span>{t("pass.issued")} {shortDate(p.issued_at)} · {p.garage.name} · {t("pass.digitally_signed")}</span>
          <span>{t("pass.passport_no")} {p.code} · {t("pass.powered_by")}</span>
        </div>
      </div>
    </div>
  );
}

function Timeline({ passport }: { passport: Passport }) {
  const { t } = useI18n();
  const { monthYear } = useFmt();
  // Build a compact flow: registered → recent services → today.
  const hist = [...passport.history].reverse(); // oldest first
  const steps: { title: string; date: string; kind: "mut" | "" | "now" }[] = [];
  steps.push({ title: t("pass.registered"), date: `${passport.vehicle.year}`, kind: "mut" });
  hist.slice(-3).forEach((h) => steps.push({ title: h.service_type, date: monthYear(h.date), kind: "" }));
  steps.push({ title: t("pass.today"), date: monthYear(passport.issued_at), kind: "now" });

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
