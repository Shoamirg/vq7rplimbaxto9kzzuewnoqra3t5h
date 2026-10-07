"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Camera, Check, LifeBuoy, MapPin, MessageSquare, Mic } from "lucide-react";

import { miniFetch } from "@/lib/mini/client";
import { haptic } from "@/lib/mini/telegram";
import { useI18n } from "@/lib/i18n/context";
import type { RoadsideCase } from "@/lib/mini/types";
import { Card, ListSkeleton, ScreenHeader } from "@/components/mini/ui";

export default function RoadsidePage() {
  const { t } = useI18n();
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
      haptic("success");
      setActive(c);
    } catch {
      haptic("error");
      setSubmitting(false);
    }
  }

  if (submitting && !active) return <div><ScreenHeader title={t("mini.roadside.title")} /><ListSkeleton /></div>;

  if (active) return <Tracking c={active} />;

  return (
    <div>
      <ScreenHeader title={t("mini.roadside.title")} subtitle={t("mini.roadside.subtitle")} />

      <div className="mb-4 flex items-center gap-3 rounded-3xl bg-linear-to-br from-red-500 to-rose-600 p-4 text-white shadow-lg">
        <div className="grid size-11 place-items-center rounded-2xl bg-white/20">
          <LifeBuoy className="size-6" aria-hidden />
        </div>
        <p className="text-sm font-medium">{t("mini.roadside.covered")}</p>
      </div>

      <label htmlFor="roadside-problem" className="mb-2 block px-1 text-sm font-semibold text-slate-700">
        {t("mini.roadside.whats_happening")}
      </label>
      <textarea
        id="roadside-problem"
        value={problem}
        onChange={(e) => setProblem(e.target.value)}
        rows={4}
        placeholder={t("mini.roadside.placeholder")}
        className="w-full rounded-2xl bg-white p-4 text-sm outline-hidden ring-1 ring-slate-900/6 focus:ring-2 focus:ring-blue-500"
      />

      <button
        onClick={shareLocation}
        className={`mt-3 flex min-h-[52px] w-full items-center gap-3 rounded-2xl p-4 text-sm font-medium ring-1 transition motion-safe:active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 ${
          coords ? "bg-green-50 text-green-700 ring-green-200" : "bg-white text-slate-700 ring-slate-900/6"
        }`}
      >
        <MapPin className="size-5" aria-hidden />
        {coords ? t("mini.roadside.location_shared") : locating ? t("mini.roadside.locating") : t("mini.roadside.share_location")}
      </button>

      <button
        onClick={submit}
        disabled={!problem.trim()}
        className="mt-5 min-h-[52px] w-full rounded-2xl bg-red-600 py-4 text-base font-bold text-white transition motion-safe:active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:opacity-40"
      >
        {t("mini.roadside.request")}
      </button>
    </div>
  );
}

function Tracking({ c }: { c: RoadsideCase }) {
  const { t } = useI18n();
  const current = c.steps.find((s) => s.current);
  return (
    <div>
      <ScreenHeader title={t("mini.roadside.on_the_way")} subtitle={t("mini.roadside.case_n", { code: c.code })} />

      <Card className="bg-blue-600! text-white! ring-blue-500!">
        <p className="text-sm text-white/80">{current ? t(`mini.roadside.flow.${current.key}`) : ""}</p>
        <p className="mt-1 text-2xl font-bold">{c.title}</p>
      </Card>

      <div className="mt-5">
        <ol className="relative ml-3 border-l-2 border-slate-200">
          {c.steps.map((s) => (
            <li key={s.key} className="mb-5 ml-6">
              <span
                className={`absolute left-[-11px] grid size-5 place-items-center rounded-full ${
                  s.done ? "bg-green-500 text-white" : s.current ? "bg-blue-600 text-white" : "bg-slate-200"
                }`}
              >
                {s.done ? <Check className="size-3" aria-hidden /> : null}
              </span>
              <p className={`text-sm font-semibold ${s.current ? "text-blue-600" : s.done ? "text-slate-700" : "text-slate-400"}`}>
                {t(`mini.roadside.step.${s.key}`)}
              </p>
            </li>
          ))}
        </ol>
      </div>

      <AttachmentBar caseId={c.id} />

      {c.conversation_id ? (
        <Link
          href={`/mini/messages/${c.conversation_id}`}
          onClick={() => haptic("light")}
          className="mt-3 flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3.5 text-sm font-semibold text-white transition motion-safe:active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50"
        >
          <MessageSquare className="size-4" aria-hidden /> {t("mini.roadside.message_dispatcher")}
        </Link>
      ) : null}
    </div>
  );
}

// Location / Photo / Voice → each becomes a Conversation attachment on the case
// thread (timeline event + Operations context) — the same path as the desktop
// Inbox. Location carries real coordinates; photo/voice attach a labelled record.
function AttachmentBar({ caseId }: { caseId: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);

  async function post(body: Record<string, unknown>, tag: string) {
    setBusy(tag);
    try {
      await miniFetch<RoadsideCase>(`/roadside/${caseId}/attachment`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      haptic("success");
      setDone((d) => ({ ...d, [tag]: true }));
    } catch {
      haptic("error");
    } finally {
      setBusy(null);
    }
  }

  function shareLocation() {
    if (!navigator.geolocation) return;
    setBusy("location");
    navigator.geolocation.getCurrentPosition(
      (p) =>
        post(
          {
            kind: "location",
            label: t("mini.roadside.location"),
            lat: p.coords.latitude,
            lng: p.coords.longitude,
          },
          "location",
        ),
      () => setBusy(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    post({ kind: "photo", label: file.name, note: "📷 Photo shared" }, "photo");
  }

  async function toggleVoice() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const started = Date.now();
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const secs = Math.max(1, Math.round((Date.now() - started) / 1000));
        post({ kind: "voice", label: `${t("mini.roadside.voice")} · ${secs}s`, note: "🎤" }, "voice");
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      /* mic denied — silently ignore */
    }
  }

  const items: { key: string; label: string; icon: typeof MapPin; onClick: () => void }[] = [
    { key: "location", label: t("mini.roadside.location"), icon: MapPin, onClick: shareLocation },
    { key: "photo", label: t("mini.roadside.photo"), icon: Camera, onClick: () => fileRef.current?.click() },
    { key: "voice", label: t("mini.roadside.voice"), icon: Mic, onClick: toggleVoice },
  ];

  return (
    <div className="mt-5">
      <p className="mb-2 px-1 text-sm font-semibold text-slate-700">{t("mini.roadside.add_report")}</p>
      <div className="grid grid-cols-3 gap-2">
        {items.map((it) => {
          const Icon = it.icon;
          const isDone = done[it.key];
          const isBusy = busy === it.key;
          const active = it.key === "voice" && recording;
          return (
            <button
              key={it.key}
              onClick={it.onClick}
              disabled={isBusy}
              aria-label={isDone ? `${it.label}: ${t("mini.roadside.shared")}` : it.label}
              className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl py-3 text-xs font-medium ring-1 transition motion-safe:active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 ${
                active
                  ? "bg-red-50 text-red-600 ring-red-200"
                  : isDone
                    ? "bg-green-50 text-green-700 ring-green-200"
                    : "bg-white text-slate-700 ring-slate-900/6"
              }`}
            >
              {isDone ? <Check className="size-5" aria-hidden /> : <Icon className="size-5" aria-hidden />}
              {isDone ? t("mini.roadside.shared") : it.label}
            </button>
          );
        })}
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
    </div>
  );
}
