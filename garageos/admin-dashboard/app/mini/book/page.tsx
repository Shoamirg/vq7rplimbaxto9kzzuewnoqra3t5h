"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, BatteryCharging, CalendarCheck, Check, ChevronRight,
  Gauge, ListChecks, Sparkles, Stethoscope, Wrench,
} from "lucide-react";

import { MiniApiError, miniFetch } from "@/lib/mini/client";
import { haptic } from "@/lib/mini/telegram";
import { Card, HealthRing, Loading, ScreenError, ScreenHeader } from "@/components/mini/ui";
import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/dictionaries";
import { clearPendingIdempotencyKey, pendingIdempotencyKey, type PendingIdempotencyKey } from "@/lib/idempotency";

type Vehicle = { id: string; label: string; health_score: number; band: string; plate?: string | null };
type BookingResult = { id: string; vehicle_label: string; service: string; date: string; local_date?: string; time: string; duration_minutes: number; mechanic_name: string | null; status: string };

const SERVICES = [
  { value: "Oil Change", label: "mini.booking.oil_change", icon: Wrench, duration: 45 },
  { value: "Brake Service", label: "mini.booking.brake_service", icon: Wrench, duration: 90 },
  { value: "Inspection", label: "mini.booking.inspection", icon: ListChecks, duration: 60 },
  { value: "Battery", label: "mini.booking.battery", icon: BatteryCharging, duration: 30 },
  { value: "Diagnostics", label: "mini.booking.diagnostics", icon: Stethoscope, duration: 60 },
  { value: "Custom", label: "mini.booking.custom", icon: Sparkles, duration: 60 },
];
const TIMES = ["09:00", "10:30", "13:00", "15:30"];

function nextDays(today: string, n: number, locale: Locale, t: (key: string) => string) {
  const out: { iso: string; label: string; sub: string }[] = [];
  const [year, month, day] = today.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day, 12));
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    const label = i === 0 ? t("mini.booking.today") : i === 1 ? t("mini.booking.tomorrow") : new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(d);
    const sub = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
    out.push({ iso, label, sub });
  }
  return out;
}

type Step = "vehicle" | "service" | "date" | "time" | "review" | "done";

export default function BookPage() {
  const { t, locale } = useI18n();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [step, setStep] = useState<Step>("vehicle");
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [service, setService] = useState<(typeof SERVICES)[number] | null>(null);
  const [date, setDate] = useState<{ iso: string; label: string } | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);

  const days = useMemo(() => today ? nextDays(today, 5, locale, (key) => t(key)) : [], [today, locale, t]);

  useEffect(() => {
    Promise.all([
      miniFetch<{ vehicles: Vehicle[] }>("/vehicles"),
      miniFetch<{ today: string }>("/appointments/today"),
    ]).then(([vehicleResponse, bookingContext]) => {
      setVehicles(vehicleResponse.vehicles);
      setToday(bookingContext.today);
    }).catch(() => setError(true));
  }, []);

  async function confirm() {
    if (!vehicle || !service || !date || !time || saving) return;
    setSaving(true);
    let pendingKey: PendingIdempotencyKey | null = null;
    let requestStarted = false;
    try {
      pendingKey = await pendingIdempotencyKey("mini-booking", {
        vehicle_id: vehicle.id,
        service: service.value,
        date: date.iso,
        time,
        duration_minutes: service.duration,
      });
      requestStarted = true;
      const res = await miniFetch<BookingResult>("/appointments", {
        method: "POST",
        headers: { "Idempotency-Key": pendingKey.key },
        body: JSON.stringify({ vehicle_id: vehicle.id, service: service.value, date: date.iso, time, duration_minutes: service.duration }),
      });
      if (typeof res.id !== "string" || res.status !== "pending") {
        throw new MiniApiError("Booking response could not be verified", 500);
      }
      clearPendingIdempotencyKey(pendingKey.storageKey);
      setOutcomeUnknown(false);
      setSubmitError(null);
      haptic("success");
      setResult(res);
      setStep("done");
    } catch (error) {
      const status = error instanceof MiniApiError ? error.status : 0;
      const unknown = requestStarted && (status === 0 || status >= 500);
      setOutcomeUnknown(unknown);
      if (!unknown && pendingKey) clearPendingIdempotencyKey(pendingKey.storageKey);
      setSubmitError(t(unknown
        ? "mini.booking.outcome_unknown"
        : status === 409
          ? "mini.booking.conflict"
          : status === 422
            ? "mini.booking.invalid"
            : status === 429
              ? "mini.booking.rate_limited"
              : "mini.booking.failed"));
      haptic("error");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ScreenError onRetry={() => location.reload()} />;

  // ── Success ───────────────────────────────────────────────────────────────
  if (step === "done" && result) {
    const requestedService = SERVICES.find((item) => item.value === result.service);
    const serviceLabel = requestedService ? t(requestedService.label) : result.service;
    const icsHref = buildIcs(result, serviceLabel, t("mini.booking.title"));
    return (
      <div className="px-4 pt-6 pb-24 text-center animate-fade-in">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-600 mb-4">
          <Check className="size-8" />
        </div>
        <h1 className="text-xl font-bold text-foreground">{t("mini.booking.success")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{result.vehicle_label} · {serviceLabel}</p>
        <Card className="mt-5 text-left">
          <Row k={t("mini.booking.when")} v={`${prettyDate(result.local_date || result.date, locale)} · ${result.time}`} />
          <Row k={t("mini.booking.duration")} v={t("mini.booking.duration_min", { n: result.duration_minutes })} />
          <Row k={t("mini.booking.advisor")} v={result.mechanic_name ?? t("mini.booking.assigned_by_garage")} />
          <Row k={t("mini.booking.status")} v={t("mini.booking.waiting_confirmation")} />
        </Card>
        <a href={icsHref} download="appointment.ics" className="mt-4 flex items-center justify-center gap-2 w-full rounded-2xl bg-slate-900 text-white py-3 font-semibold">
          <CalendarCheck className="size-4" /> {t("mini.booking.add_calendar")}
        </a>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Link href="/mini/messages" className="rounded-2xl border border-slate-200 py-3 font-semibold text-foreground text-center">{t("mini.booking.message_advisor")}</Link>
          <Link href="/mini" className="rounded-2xl border border-slate-200 py-3 font-semibold text-foreground text-center">{t("mini.booking.home")}</Link>
        </div>
      </div>
    );
  }

  const stepIndex = ["vehicle", "service", "date", "time", "review"].indexOf(step);

  return (
    <div className="px-4 pt-4 pb-28">
      <div className="flex items-center gap-3 mb-3">
        {step !== "vehicle" ? (
          <button onClick={() => setStep(back(step))} disabled={outcomeUnknown} aria-label={t("mini.booking.back")} className="p-1.5 -ml-1.5 rounded-lg active:bg-muted disabled:opacity-40"><ArrowLeft className="size-5 text-muted-foreground" /></button>
        ) : (
          <Link href="/mini" aria-label={t("mini.booking.home")} className="p-1.5 -ml-1.5 rounded-lg active:bg-muted"><ArrowLeft className="size-5 text-muted-foreground" /></Link>
        )}
        <div className="flex-1 flex gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-slate-900" : "bg-slate-200"}`} />
          ))}
        </div>
      </div>

      {step === "vehicle" && (
        <>
          <ScreenHeader title={t("mini.booking.title")} subtitle={t("mini.booking.choose_vehicle")} />
          {!vehicles ? <Loading /> : (
            <div className="space-y-3 mt-2">
              {vehicles.length === 0 ? <Card>{t("mini.booking.empty_vehicles")}</Card> : null}
              {vehicles.map((v) => (
                  <button key={v.id} onClick={() => { haptic("selection"); setSubmitError(null); setOutcomeUnknown(false); setVehicle(v); setStep("service"); }}
                  className="w-full text-left active:scale-[.99] transition-transform">
                  <Card className="flex items-center gap-3">
                    <HealthRing score={v.health_score} band={v.band} size={48} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground truncate">{v.label}</div>
                      <div className="text-xs text-muted-foreground">Health {Math.round(v.health_score)} · {v.band}</div>
                    </div>
                    <ChevronRight className="size-5 text-slate-300" />
                  </Card>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {step === "service" && vehicle && (
        <>
          <ScreenHeader title={t("mini.booking.choose_service")} subtitle={vehicle.label} />
          {vehicle.band === "fair" || vehicle.band === "poor" ? (
            <div className="flex items-start gap-2 rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 mb-3">
              <Gauge className="size-4 mt-0.5 shrink-0" />
              <span>{t("mini.booking.health_advice", { band: t(`mini.band.${vehicle.band}`) })}</span>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3 mt-1">
            {SERVICES.map((s) => (
              <button key={s.value} onClick={() => { haptic("selection"); setSubmitError(null); setOutcomeUnknown(false); setService(s); setStep("date"); }}
                className="active:scale-[.98] transition-transform">
                <Card className="flex flex-col items-start gap-2 h-full">
                  <span className="grid size-9 place-items-center rounded-xl bg-muted text-foreground"><s.icon className="size-4" /></span>
                  <span className="font-semibold text-foreground text-sm">{t(s.label)}</span>
                  <span className="text-xs text-muted-foreground">{t("mini.booking.duration_min", { n: s.duration })}</span>
                </Card>
              </button>
            ))}
          </div>
        </>
      )}

      {step === "date" && (
        <>
          <ScreenHeader title={t("mini.booking.choose_day")} subtitle={service ? t(service.label) : undefined} />
          <div className="space-y-2.5 mt-1">
            {days.map((d) => (
              <button key={d.iso} onClick={() => { haptic("selection"); setSubmitError(null); setOutcomeUnknown(false); setDate(d); setStep("time"); }}
                className="w-full active:scale-[.99] transition-transform">
                <Card className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{d.label}</span>
                  <span className="text-sm text-muted-foreground">{d.sub}</span>
                </Card>
              </button>
            ))}
          </div>
        </>
      )}

      {step === "time" && (
        <>
          <ScreenHeader title={t("mini.booking.choose_time")} subtitle={`${date?.label} · ${service ? t(service.label) : ""}`} />
          <div className="grid grid-cols-2 gap-3 mt-1">
            {TIMES.map((t) => (
              <button key={t} onClick={() => { haptic("selection"); setSubmitError(null); setOutcomeUnknown(false); setTime(t); setStep("review"); }}
                className="active:scale-[.98] transition-transform">
                <Card className="text-center font-semibold text-foreground py-4">{t}</Card>
              </button>
            ))}
          </div>
        </>
      )}

      {step === "review" && vehicle && service && date && time && (
        <>
          <ScreenHeader title={t("mini.booking.review")} subtitle={t("mini.booking.confirm_request")} />
          {submitError ? <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{submitError}</p> : null}
          <Card className="mt-1">
            <Row k={t("mini.booking.vehicle")} v={vehicle.label} />
            <Row k={t("mini.booking.service")} v={t(service.label)} />
            <Row k={t("mini.booking.when")} v={`${date.label} · ${time}`} />
            <Row k={t("mini.booking.duration")} v={t("mini.booking.duration_min", { n: service.duration })} />
            <Row k={t("mini.booking.advisor")} v={t("mini.booking.assigned_by_garage")} />
          </Card>
          <button onClick={confirm} disabled={saving}
            className="mt-5 w-full rounded-2xl bg-slate-900 text-white py-3.5 font-bold active:scale-[.99] transition-transform disabled:opacity-60">
            {saving ? t("mini.booking.sending") : t("mini.booking.send")}
          </button>
        </>
      )}
    </div>
  );
}

function back(step: Step): Step {
  const order: Step[] = ["vehicle", "service", "date", "time", "review"];
  const i = order.indexOf(step);
  return order[Math.max(0, i - 1)];
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
      <span className="text-sm text-muted-foreground">{k}</span>
      <span className="text-sm font-semibold text-foreground text-right">{v}</span>
    </div>
  );
}

function prettyDate(iso: string, locale: Locale): string {
  const key = iso.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? iso;
  const [year, month, day] = key.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat(locale, { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }).format(d);
}

function buildIcs(r: BookingResult, serviceLabel: string, bookingLabel: string): string {
  const start = new Date(r.date);
  const end = new Date(start.getTime() + r.duration_minutes * 60000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT",
    `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${serviceLabel} — ${r.vehicle_label}`,
    `DESCRIPTION:${bookingLabel} · GarageOS`, "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}
