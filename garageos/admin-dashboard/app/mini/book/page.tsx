"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, BatteryCharging, CalendarCheck, Check, ChevronRight,
  Gauge, ListChecks, Sparkles, Stethoscope, Wrench,
} from "lucide-react";

import { miniFetch } from "@/lib/mini/client";
import { haptic } from "@/lib/mini/telegram";
import { Card, HealthRing, Loading, ScreenError, ScreenHeader } from "@/components/mini/ui";

type Vehicle = { id: string; label: string; health_score: number; band: string; plate?: string | null };
type BookingResult = { id: string; vehicle_label: string; service: string; date: string; time: string; duration_minutes: number; mechanic_name: string | null; status: string };

const SERVICES = [
  { key: "Oil Change", icon: Wrench, duration: 45 },
  { key: "Brake Service", icon: Wrench, duration: 90 },
  { key: "Inspection", icon: ListChecks, duration: 60 },
  { key: "Battery", icon: BatteryCharging, duration: 30 },
  { key: "Diagnostics", icon: Stethoscope, duration: 60 },
  { key: "Custom", icon: Sparkles, duration: 60 },
];
const TIMES = ["09:00", "10:30", "13:00", "15:30"];

function nextDays(n: number) {
  const out: { iso: string; label: string; sub: string }[] = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "long" });
    out.push({ iso, label, sub: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) });
  }
  return out;
}

type Step = "vehicle" | "service" | "date" | "time" | "review" | "done";

export default function BookPage() {
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [error, setError] = useState(false);
  const [step, setStep] = useState<Step>("vehicle");
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [service, setService] = useState<(typeof SERVICES)[number] | null>(null);
  const [date, setDate] = useState<{ iso: string; label: string } | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);

  const days = useMemo(() => nextDays(5), []);

  useEffect(() => {
    miniFetch<{ vehicles: Vehicle[] }>("/vehicles").then((r) => setVehicles(r.vehicles)).catch(() => setError(true));
  }, []);

  async function confirm() {
    if (!vehicle || !service || !date || !time || saving) return;
    setSaving(true);
    try {
      const res = await miniFetch<BookingResult>("/appointments", {
        method: "POST",
        body: JSON.stringify({ vehicle_id: vehicle.id, service: service.key, date: date.iso, time, duration_minutes: service.duration }),
      });
      haptic("success");
      setResult(res);
      setStep("done");
    } catch {
      haptic("error");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ScreenError onRetry={() => location.reload()} />;

  // ── Success ───────────────────────────────────────────────────────────────
  if (step === "done" && result) {
    const icsHref = buildIcs(result);
    return (
      <div className="px-4 pt-6 pb-24 text-center animate-fade-in">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-600 mb-4">
          <Check className="size-8" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Appointment booked</h1>
        <p className="text-sm text-muted-foreground mt-1">{result.vehicle_label} · {result.service}</p>
        <Card className="mt-5 text-left">
          <Row k="When" v={`${prettyDate(result.date)} · ${result.time}`} />
          <Row k="Duration" v={`${result.duration_minutes} min`} />
          <Row k="Advisor" v={result.mechanic_name ?? "Assigned by the shop"} />
          <Row k="Status" v="Pending confirmation" />
        </Card>
        <a href={icsHref} download="appointment.ics" className="mt-4 flex items-center justify-center gap-2 w-full rounded-2xl bg-slate-900 text-white py-3 font-semibold">
          <CalendarCheck className="size-4" /> Add to calendar
        </a>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Link href="/mini/messages" className="rounded-2xl border border-slate-200 py-3 font-semibold text-foreground text-center">Message advisor</Link>
          <Link href="/mini" className="rounded-2xl border border-slate-200 py-3 font-semibold text-foreground text-center">Home</Link>
        </div>
      </div>
    );
  }

  const stepIndex = ["vehicle", "service", "date", "time", "review"].indexOf(step);

  return (
    <div className="px-4 pt-4 pb-28">
      <div className="flex items-center gap-3 mb-3">
        {step !== "vehicle" ? (
          <button onClick={() => setStep(back(step))} aria-label="Back" className="p-1.5 -ml-1.5 rounded-lg active:bg-muted"><ArrowLeft className="size-5 text-muted-foreground" /></button>
        ) : (
          <Link href="/mini" aria-label="Home" className="p-1.5 -ml-1.5 rounded-lg active:bg-muted"><ArrowLeft className="size-5 text-muted-foreground" /></Link>
        )}
        <div className="flex-1 flex gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-slate-900" : "bg-slate-200"}`} />
          ))}
        </div>
      </div>

      {step === "vehicle" && (
        <>
          <ScreenHeader title="Book a service" subtitle="Which vehicle?" />
          {!vehicles ? <Loading /> : (
            <div className="space-y-3 mt-2">
              {vehicles.map((v) => (
                <button key={v.id} onClick={() => { haptic("selection"); setVehicle(v); setStep("service"); }}
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
          <ScreenHeader title="Select service" subtitle={vehicle.label} />
          {vehicle.band === "fair" || vehicle.band === "poor" ? (
            <div className="flex items-start gap-2 rounded-2xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 mb-3">
              <Gauge className="size-4 mt-0.5 shrink-0" />
              <span>This vehicle&rsquo;s health is <b>{vehicle.band}</b> — an Inspection is a good idea.</span>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3 mt-1">
            {SERVICES.map((s) => (
              <button key={s.key} onClick={() => { haptic("selection"); setService(s); setStep("date"); }}
                className="active:scale-[.98] transition-transform">
                <Card className="flex flex-col items-start gap-2 h-full">
                  <span className="grid size-9 place-items-center rounded-xl bg-muted text-foreground"><s.icon className="size-4" /></span>
                  <span className="font-semibold text-foreground text-sm">{s.key}</span>
                  <span className="text-xs text-muted-foreground">{s.duration} min</span>
                </Card>
              </button>
            ))}
          </div>
        </>
      )}

      {step === "date" && (
        <>
          <ScreenHeader title="Choose a day" subtitle={service?.key} />
          <div className="space-y-2.5 mt-1">
            {days.map((d) => (
              <button key={d.iso} onClick={() => { haptic("selection"); setDate(d); setStep("time"); }}
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
          <ScreenHeader title="Choose a time" subtitle={`${date?.label} · ${service?.key}`} />
          <div className="grid grid-cols-2 gap-3 mt-1">
            {TIMES.map((t) => (
              <button key={t} onClick={() => { haptic("selection"); setTime(t); setStep("review"); }}
                className="active:scale-[.98] transition-transform">
                <Card className="text-center font-semibold text-foreground py-4">{t}</Card>
              </button>
            ))}
          </div>
        </>
      )}

      {step === "review" && vehicle && service && date && time && (
        <>
          <ScreenHeader title="Review" subtitle="Confirm your appointment" />
          <Card className="mt-1">
            <Row k="Vehicle" v={vehicle.label} />
            <Row k="Service" v={service.key} />
            <Row k="When" v={`${date.label} · ${time}`} />
            <Row k="Duration" v={`${service.duration} min`} />
            <Row k="Advisor" v="Assigned by the shop" />
          </Card>
          <button onClick={confirm} disabled={saving}
            className="mt-5 w-full rounded-2xl bg-slate-900 text-white py-3.5 font-bold active:scale-[.99] transition-transform disabled:opacity-60">
            {saving ? "Booking…" : "Confirm booking"}
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

function prettyDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function buildIcs(r: BookingResult): string {
  const start = new Date(r.date);
  const end = new Date(start.getTime() + r.duration_minutes * 60000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT",
    `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${r.service} — ${r.vehicle_label}`,
    "DESCRIPTION:Booked via GarageOS", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}
