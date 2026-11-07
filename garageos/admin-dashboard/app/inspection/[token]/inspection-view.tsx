"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  FileCheck,
  Flame,
  Info,
  Phone,
  ShieldAlert,
  ShieldCheck,
  Wrench,
  X,
  XCircle,
} from "lucide-react";

interface InspectionItem {
  id: string;
  category: string;
  title: string;
  rating: "green" | "yellow" | "red";
  notes: string | null;
  photos: string[];
  estimated_labor_price: number;
  estimated_parts_price: number;
  total_price: number;
  customer_decision: "pending" | "approved" | "declined";
  customer_comment: string | null;
  sort_order: number;
}

interface InspectionData {
  id: string;
  public_token: string;
  title: string;
  status: string;
  summary_notes: string | null;
  mileage_at_inspection: number | null;
  overall_score: number;
  created_at: string | null;
  vehicle: {
    id: string | null;
    make: string;
    model: string;
    year: number | null;
    license_plate: string;
    vin: string | null;
  } | null;
  service_center: {
    name: string;
    phone: string | null;
    address: string | null;
  } | null;
  summary: {
    total_items: number;
    green_count: number;
    yellow_count: number;
    red_count: number;
    total_estimated_amount: number;
    approved_amount: number;
  };
  items: InspectionItem[];
}

const CATEGORY_NAMES: Record<string, string> = {
  engine_fluids: "Dvigatel & Suyuqliklar",
  brakes: "Tormoz tizimi",
  tires_wheels: "Shinalar & G'ildiraklar",
  suspension_steering: "Xodovoy & Rul boshqaruvi",
  battery_electrical: "Akkumulyator & Elektrika",
  body_glass: "Kuzov & Oynalar",
};

export function InspectionView({
  inspection: initialInspection,
  apiBase,
}: {
  inspection: InspectionData;
  apiBase: string;
}) {
  const [inspection, setInspection] = useState<InspectionData>(initialInspection);
  const [filter, setFilter] = useState<"all" | "red" | "yellow" | "green">("all");
  const [decisions, setDecisions] = useState<Record<string, "approved" | "declined">>(() => {
    const init: Record<string, "approved" | "declined"> = {};
    for (const item of initialInspection.items) {
      if (item.customer_decision === "approved" || item.customer_decision === "declined") {
        init[item.id] = item.customer_decision;
      }
    }
    return init;
  });
  const [comments, setComments] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const toggleDecision = (itemId: string, choice: "approved" | "declined") => {
    setDecisions((prev) => {
      if (prev[itemId] === choice) {
        const next = { ...prev };
        delete next[itemId];
        return next;
      }
      return { ...prev, [itemId]: choice };
    });
  };

  const filteredItems = inspection.items.filter((item) => {
    if (filter === "all") return true;
    return item.rating === filter;
  });

  // Calculate live approved total
  const calculatedApprovedTotal = inspection.items.reduce((sum, item) => {
    if (decisions[item.id] === "approved") {
      return sum + item.total_price;
    }
    return sum;
  }, 0);

  const pendingDecisionsCount = Object.keys(decisions).length;

  const handleSubmitDecisions = async () => {
    if (pendingDecisionsCount === 0) return;
    setSubmitting(true);
    setSubmittedMessage(null);
    try {
      const payload = {
        decisions: Object.entries(decisions).map(([itemId, decision]) => ({
          item_id: itemId,
          decision,
          comment: comments[itemId] || undefined,
        })),
      };

      const res = await fetch(`${apiBase}/public/inspections/${inspection.public_token}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Xatolik yuz berdi");
      }

      const updated = await res.json();
      setInspection(updated);
      setSubmittedMessage("Qaroringiz muvaffaqiyatli qabul qilindi! Tanlangan ta'mirlash ishlari buyurtma varaqasiga kiritildi.");
    } catch (e: any) {
      alert("Xatolik: Qarorlarni yuborishda muammo yuz berdi. Iltimos qaytadan urining.");
    } finally {
      setSubmitting(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-emerald-500 border-emerald-500 bg-emerald-500/10";
    if (score >= 60) return "text-amber-500 border-amber-500 bg-amber-500/10";
    return "text-red-500 border-red-500 bg-red-500/10";
  };

  const getRatingBadge = (rating: string) => {
    switch (rating) {
      case "red":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/20">
            <ShieldAlert className="size-3.5" /> Xavfli / Zudlik bilan
          </span>
        );
      case "yellow":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle className="size-3.5" /> E&apos;tibor talab
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="size-3.5" /> Qoniqarli
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-slate-100 pb-32">
      {/* Service Center Header */}
      <header className="border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-lg border border-amber-500/30">
              G
            </div>
            <div>
              <h1 className="font-semibold text-base leading-tight">
                {inspection.service_center?.name || "GarageOS Avtoservis"}
              </h1>
              <p className="text-xs text-slate-500 dark:text-zinc-400 flex items-center gap-1 mt-0.5">
                <FileCheck className="size-3 text-emerald-500" /> Raqamli texnik ko&apos;rik (DVI)
              </p>
            </div>
          </div>
          {inspection.service_center?.phone && (
            <a
              href={`tel:${inspection.service_center.phone}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 transition"
            >
              <Phone className="size-3.5" />
              <span>Bog&apos;lanish</span>
            </a>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Success Alert Banner */}
        {submittedMessage && (
          <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 flex items-start gap-3">
            <CheckCircle2 className="size-5 shrink-0 mt-0.5 text-emerald-500" />
            <div className="text-sm">
              <p className="font-medium">{submittedMessage}</p>
            </div>
          </div>
        )}

        {/* Vehicle Overview Card */}
        <section className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-slate-200 dark:border-zinc-800 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-amber-600 dark:text-amber-400">
                Avtomobil hisoboti
              </span>
              <h2 className="text-2xl font-bold tracking-tight mt-0.5">
                {inspection.vehicle
                  ? `${inspection.vehicle.make} ${inspection.vehicle.model}`
                  : "Avtomobil ko'riki"}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-600 dark:text-zinc-400">
                {inspection.vehicle?.license_plate && (
                  <span className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-zinc-800 font-mono font-bold text-slate-800 dark:text-zinc-200 border border-slate-200 dark:border-zinc-700">
                    {inspection.vehicle.license_plate}
                  </span>
                )}
                {inspection.vehicle?.year && (
                  <span>{inspection.vehicle.year}-yil</span>
                )}
                {inspection.mileage_at_inspection && (
                  <span>· {inspection.mileage_at_inspection.toLocaleString()} km</span>
                )}
                {inspection.created_at && (
                  <span>· {new Date(inspection.created_at).toLocaleDateString("uz-UZ")}</span>
                )}
              </div>
            </div>

            {/* Health Score Badge */}
            <div className="flex items-center gap-3 bg-slate-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-slate-200/60 dark:border-zinc-700/60 self-start sm:self-center">
              <div
                className={`size-14 rounded-full border-4 flex items-center justify-center font-black text-xl ${getScoreColor(
                  inspection.overall_score
                )}`}
              >
                {inspection.overall_score}
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">Holat balli</p>
                <p className="text-sm font-bold">
                  {inspection.overall_score >= 85
                    ? "A'lo holatda"
                    : inspection.overall_score >= 60
                    ? "E&apos;tibor talab"
                    : "Ta&apos;mirlash zarur"}
                </p>
              </div>
            </div>
          </div>

          {inspection.summary_notes && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-400 italic">
              &ldquo; {inspection.summary_notes} &rdquo;
            </div>
          )}
        </section>

        {/* Traffic Light Breakdown Chips & Tabs */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Ko&apos;rik bandlari ({inspection.summary.total_items})
            </h3>
            <span className="text-xs text-slate-500 dark:text-zinc-400">
              Taxminiy qiymat:{" "}
              <strong className="text-slate-800 dark:text-zinc-200">
                {inspection.summary.total_estimated_amount.toLocaleString()} UZS
              </strong>
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`p-2.5 rounded-xl text-center border transition ${
                filter === "all"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-xs"
                  : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800/60"
              }`}
            >
              <div className="text-lg font-bold leading-tight">{inspection.summary.total_items}</div>
              <div className="text-[11px] opacity-80 mt-0.5">Barchasi</div>
            </button>

            <button
              onClick={() => setFilter("red")}
              className={`p-2.5 rounded-xl text-center border transition ${
                filter === "red"
                  ? "bg-red-500 text-white border-transparent shadow-xs"
                  : "bg-white dark:bg-zinc-900 border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/10"
              }`}
            >
              <div className="text-lg font-bold leading-tight">{inspection.summary.red_count}</div>
              <div className="text-[11px] opacity-80 mt-0.5">🔴 Xavfli</div>
            </button>

            <button
              onClick={() => setFilter("yellow")}
              className={`p-2.5 rounded-xl text-center border transition ${
                filter === "yellow"
                  ? "bg-amber-500 text-white border-transparent shadow-xs"
                  : "bg-white dark:bg-zinc-900 border-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
              }`}
            >
              <div className="text-lg font-bold leading-tight">{inspection.summary.yellow_count}</div>
              <div className="text-[11px] opacity-80 mt-0.5">🟡 E&apos;tibor talab</div>
            </button>

            <button
              onClick={() => setFilter("green")}
              className={`p-2.5 rounded-xl text-center border transition ${
                filter === "green"
                  ? "bg-emerald-500 text-white border-transparent shadow-xs"
                  : "bg-white dark:bg-zinc-900 border-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              }`}
            >
              <div className="text-lg font-bold leading-tight">{inspection.summary.green_count}</div>
              <div className="text-[11px] opacity-80 mt-0.5">🟢 Qoniqarli</div>
            </button>
          </div>
        </section>

        {/* Inspection Items List */}
        <section className="space-y-3">
          {filteredItems.map((item) => {
            const currentDecision = decisions[item.id] || item.customer_decision;
            const hasEstimates = item.total_price > 0;

            return (
              <div
                key={item.id}
                className={`bg-white dark:bg-zinc-900 rounded-2xl p-4 sm:p-5 border transition-all ${
                  item.rating === "red"
                    ? "border-red-500/40 shadow-xs"
                    : item.rating === "yellow"
                    ? "border-amber-500/30"
                    : "border-slate-200 dark:border-zinc-800"
                }`}
              >
                {/* Item Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-1">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 uppercase tracking-wider">
                      {CATEGORY_NAMES[item.category] || item.category}
                    </span>
                    <h4 className="text-base font-semibold">{item.title}</h4>
                  </div>
                  <div>{getRatingBadge(item.rating)}</div>
                </div>

                {/* Mechanic Observation Notes */}
                {item.notes && (
                  <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200/60 dark:border-zinc-700/60 text-sm text-slate-700 dark:text-zinc-300 flex items-start gap-2">
                    <Wrench className="size-4 text-amber-500 shrink-0 mt-0.5" />
                    <span>{item.notes}</span>
                  </div>
                )}

                {/* Photos Gallery */}
                {item.photos && item.photos.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                      Foto hisobot ({item.photos.length}):
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {item.photos.map((photoUrl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedPhoto(photoUrl)}
                          className="relative size-20 rounded-xl overflow-hidden border border-slate-200 dark:border-zinc-700 group focus:outline-hidden"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photoUrl}
                            alt="Korik fotosi"
                            className="w-full h-full object-cover group-hover:scale-105 transition"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition">
                            <Eye className="size-4" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Financial Estimate Breakdown (if applicable) */}
                {hasEstimates && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3 text-slate-600 dark:text-zinc-400">
                      {item.estimated_parts_price > 0 && (
                        <span>
                          Ehtiyot qism:{" "}
                          <strong className="text-slate-800 dark:text-zinc-200">
                            {item.estimated_parts_price.toLocaleString()} UZS
                          </strong>
                        </span>
                      )}
                      {item.estimated_labor_price > 0 && (
                        <span>
                          Ta&apos;mirlash xizmati:{" "}
                          <strong className="text-slate-800 dark:text-zinc-200">
                            {item.estimated_labor_price.toLocaleString()} UZS
                          </strong>
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      Jami: {item.total_price.toLocaleString()} UZS
                    </div>
                  </div>
                )}

                {/* Interactive Customer Decision Area (for Red & Yellow items) */}
                {(item.rating === "red" || item.rating === "yellow" || hasEstimates) && (
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      Sizning qaroringiz:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleDecision(item.id, "approved")}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                          currentDecision === "approved"
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-emerald-500/10 hover:text-emerald-600"
                        }`}
                      >
                        <Check className="size-3.5" />
                        <span>Tasdiqlayman</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleDecision(item.id, "declined")}
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                          currentDecision === "declined"
                            ? "bg-rose-600 text-white shadow-xs"
                            : "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-rose-500/10 hover:text-rose-600"
                        }`}
                      >
                        <X className="size-3.5" />
                        <span>Rad etaman</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </main>

      {/* Floating Bottom Sticky Bar for Customer Decision Submit */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur border-t border-slate-200 dark:border-zinc-800 p-4 z-40">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-zinc-400">
              Tanlangan ishlar qiymati:
            </div>
            <div className="text-lg font-black text-emerald-600 dark:text-emerald-400">
              {calculatedApprovedTotal.toLocaleString()} UZS
            </div>
          </div>

          <button
            type="button"
            disabled={pendingDecisionsCount === 0 || submitting}
            onClick={handleSubmitDecisions}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition shadow-md ${
              pendingDecisionsCount > 0 && !submitting
                ? "bg-amber-500 hover:bg-amber-600 text-slate-950 cursor-pointer"
                : "bg-slate-200 dark:bg-zinc-800 text-slate-400 dark:text-zinc-600 cursor-not-allowed"
            }`}
          >
            {submitting ? (
              <span>Yuborilmoqda...</span>
            ) : (
              <>
                <FileCheck className="size-4" />
                <span>Qarorlarni tasdiqlash ({pendingDecisionsCount})</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Photo Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 size-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black"
            >
              <X className="size-6" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedPhoto}
              alt="Kattalashtirilgan foto"
              className="max-w-full max-h-[85vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
