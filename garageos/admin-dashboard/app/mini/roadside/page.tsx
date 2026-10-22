"use client";

import { useState } from "react";
import Link from "next/link";
import { LifeBuoy, MapPin, MessageSquare } from "lucide-react";

import { miniFetch } from "@/lib/mini/client";
import { haptic } from "@/lib/mini/telegram";
import { useI18n } from "@/lib/i18n/context";
import type { RoadsideCase } from "@/lib/mini/types";
import { Card, ScreenHeader } from "@/components/mini/ui";

export default function RoadsidePage() {
  const { t } = useI18n();
  const [problem, setProblem] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [active, setActive] = useState<RoadsideCase | null>(null);

  function shareLocation() {
    if (!navigator.geolocation || locating) {
      setLocationError(true);
      return;
    }
    setLocationError(false);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocationError(true);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function submit() {
    if (!problem.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const created = await miniFetch<RoadsideCase>("/roadside", {
        method: "POST",
        body: JSON.stringify({
          description: problem.trim(),
          location_lat: coords?.lat ?? null,
          location_lng: coords?.lng ?? null,
          location_text: coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : null,
        }),
      });
      haptic("success");
      setActive(created);
    } catch {
      haptic("error");
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (active) return <RequestReceived c={active} />;

  return (
    <div>
      <ScreenHeader title={t("mini.roadside.title")} subtitle={t("mini.roadside.subtitle")} />

      <div className="mb-4 flex items-center gap-3 rounded-3xl bg-linear-to-br from-red-700 to-rose-700 p-4 text-white shadow-lg">
        <div className="grid size-11 place-items-center rounded-2xl bg-white/20">
          <LifeBuoy className="size-6" aria-hidden />
        </div>
        <p className="text-sm font-medium">{t("mini.roadside.covered")}</p>
      </div>

      <label htmlFor="roadside-problem" className="mb-2 block px-1 text-sm font-semibold text-foreground">
        {t("mini.roadside.whats_happening")}
      </label>
      <textarea
        id="roadside-problem"
        value={problem}
        onChange={(event) => setProblem(event.target.value)}
        rows={4}
        maxLength={2000}
        placeholder={t("mini.roadside.placeholder")}
        className="w-full rounded-2xl bg-card p-4 text-sm outline-hidden ring-1 ring-slate-900/6 focus:ring-2 focus:ring-primary-500"
      />

      <button
        type="button"
        onClick={shareLocation}
        disabled={locating}
        className={`mt-3 flex min-h-[52px] w-full items-center gap-3 rounded-2xl p-4 text-sm font-medium ring-1 transition motion-safe:active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-60 ${
          coords ? "bg-green-50 text-green-700 ring-green-200" : "bg-card text-foreground ring-slate-900/6"
        }`}
      >
        <MapPin className="size-5" aria-hidden />
        {coords ? t("mini.roadside.location_shared") : locating ? t("mini.roadside.locating") : t("mini.roadside.share_location")}
      </button>
      {locationError ? <p role="status" className="mt-2 px-1 text-sm text-amber-700">{t("mini.roadside.location_unavailable")}</p> : null}
      {submitError ? <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{t("mini.roadside.request_failed")}</p> : null}

      <button
        type="button"
        onClick={submit}
        disabled={!problem.trim() || submitting}
        className="mt-5 min-h-[52px] w-full rounded-2xl bg-danger-action py-4 text-base font-bold text-white transition motion-safe:active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:opacity-40"
      >
        {submitting ? t("mini.roadside.sending") : t("mini.roadside.request")}
      </button>
    </div>
  );
}

function RequestReceived({ c }: { c: RoadsideCase }) {
  const { t } = useI18n();
  return (
    <div>
      <ScreenHeader title={t("mini.roadside.request_received_title")} subtitle={t("mini.roadside.case_n", { code: c.code })} />
      <Card className="bg-[#181B20]! text-white! ring-white/10!">
        <p className="text-lg font-bold">{t("mini.roadside.request_received")}</p>
        <p className="mt-2 text-sm text-white/85">{t("mini.roadside.dispatcher_updates")}</p>
        <p className="mt-3 text-sm font-semibold">{c.title}</p>
      </Card>
      {c.conversation_id ? (
        <Link
          href={`/mini/messages/${c.conversation_id}`}
          onClick={() => haptic("light")}
          className="mt-4 flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground transition motion-safe:active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
        >
          <MessageSquare className="size-4" aria-hidden /> {t("mini.roadside.message_dispatcher")}
        </Link>
      ) : null}
      <Link href="/mini" className="mt-3 flex min-h-[48px] items-center justify-center rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-foreground">
        {t("mini.roadside.back_home")}
      </Link>
    </div>
  );
}
