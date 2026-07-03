"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, LifeBuoy, MapPin, MessageSquare } from "lucide-react";

import { miniFetch } from "@/lib/mini/client";
import type { RoadsideCase } from "@/lib/mini/types";
import { Card, Loading, ScreenHeader } from "@/components/mini/ui";

export default function RoadsidePage() {
  const [problem, setProblem] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [active, setActive] = useState<RoadsideCase | null>(null);

  function shareLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  async function submit() {
    if (!problem.trim() || submitting) return;
    setSubmitting(true);
    try {
      const c = await miniFetch<RoadsideCase>("/roadside", {
        method: "POST",
        body: JSON.stringify({
          description: problem.trim(),
          location_lat: coords?.lat ?? null,
          location_lng: coords?.lng ?? null,
          location_text: coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : null,
        }),
      });
      setActive(c);
    } catch {
      setSubmitting(false);
    }
  }

  if (submitting && !active) return <div><ScreenHeader title="Roadside" /><Loading /></div>;

  if (active) return <Tracking c={active} />;

  return (
    <div>
      <ScreenHeader title="Roadside help" subtitle="Tell us what's wrong — a dispatcher responds fast." />

      <div className="mb-4 flex items-center gap-3 rounded-3xl bg-gradient-to-br from-red-500 to-rose-600 p-4 text-white shadow-lg">
        <div className="grid size-11 place-items-center rounded-2xl bg-white/20">
          <LifeBuoy className="size-6" />
        </div>
        <p className="text-sm font-medium">You&apos;re covered. Help is one tap away.</p>
      </div>

      <label className="mb-2 block px-1 text-sm font-semibold text-slate-700">What&apos;s happening?</label>
      <textarea
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
        rows={4}
        placeholder="e.g. Flat tyre on the highway, front left…"
        className="w-full rounded-2xl bg-white p-4 text-sm outline-none ring-1 ring-slate-900/[0.06] focus:ring-2 focus:ring-blue-500"
      />

      <button
        onClick={shareLocation}
        className={`mt-3 flex w-full items-center gap-3 rounded-2xl p-4 text-sm font-medium ring-1 transition active:scale-[0.99] ${
          coords ? "bg-green-50 text-green-700 ring-green-200" : "bg-white text-slate-700 ring-slate-900/[0.06]"
        }`}
      >
        <MapPin className="size-5" />
        {coords ? "Location shared ✓" : locating ? "Getting location…" : "Share my location"}
      </button>

      <button
        onClick={submit}
        disabled={!problem.trim()}
        className="mt-5 w-full rounded-2xl bg-red-600 py-4 text-base font-bold text-white transition active:scale-[0.99] disabled:opacity-40"
      >
        Request assistance
      </button>
    </div>
  );
}

const FLOW_NOTE: Record<string, string> = {
  reported: "We've got your request",
  assigned: "A technician is assigned",
  en_route: "Your technician is on the way",
  arrived: "Your technician has arrived",
  resolved: "All sorted — safe travels!",
};

function Tracking({ c }: { c: RoadsideCase }) {
  const current = c.steps.find((s) => s.current);
  return (
    <div>
      <ScreenHeader title="Help is on the way" subtitle={`Case ${c.code}`} />

      <Card className="!bg-blue-600 !text-white !ring-blue-500">
        <p className="text-sm text-white/80">{current ? FLOW_NOTE[current.key] : "In progress"}</p>
        <p className="mt-1 text-2xl font-bold">{c.title}</p>
      </Card>

      <div className="mt-5">
        <ol className="relative ml-3 border-l-2 border-slate-200">
          {c.steps.map((s) => (
            <li key={s.key} className="mb-5 ml-6">
              <span
                className={`absolute -left-[11px] grid size-5 place-items-center rounded-full ${
                  s.done ? "bg-green-500 text-white" : s.current ? "bg-blue-600 text-white" : "bg-slate-200"
                }`}
              >
                {s.done ? <Check className="size-3" /> : null}
              </span>
              <p className={`text-sm font-semibold ${s.current ? "text-blue-600" : s.done ? "text-slate-700" : "text-slate-400"}`}>
                {s.label}
              </p>
            </li>
          ))}
        </ol>
      </div>

      {c.conversation_id ? (
        <Link
          href={`/mini/messages/${c.conversation_id}`}
          className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-sm font-semibold text-white active:scale-[0.99]"
        >
          <MessageSquare className="size-4" /> Message dispatcher
        </Link>
      ) : null}
    </div>
  );
}
