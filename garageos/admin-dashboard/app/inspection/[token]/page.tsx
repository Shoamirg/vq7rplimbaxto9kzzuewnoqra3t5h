import type { Metadata } from "next";
import { FileWarning } from "lucide-react";
import { getPublicInspection, apiBaseUrl } from "@/lib/api/server";
import { InspectionView } from "./inspection-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const inspection = await getPublicInspection(token).catch(() => null);
  if (!inspection) {
    return {
      title: "Raqamli ko'rik topilmadi · GarageOS",
      robots: { index: false },
    };
  }

  const vehicleName = inspection.vehicle
    ? `${inspection.vehicle.make} ${inspection.vehicle.model}`
    : "Avtomobil";

  return {
    title: `${vehicleName} · Raqamli texnik ko'rik (DVI)`,
    description: `Avtomobil ko'rik natijasi: ${inspection.overall_score} ball. ${inspection.service_center?.name ?? "GarageOS"}`,
    robots: { index: false },
  };
}

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const inspection = await getPublicInspection(token).catch(() => null);

  if (!inspection) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 dark:bg-zinc-950 p-6">
        <div className="max-w-sm text-center space-y-3">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-600">
            <FileWarning className="size-7" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
            Texnik ko&apos;rik topilmadi
          </h1>
          <p className="text-sm text-slate-500 dark:text-zinc-400">
            Havola eskirgan, o&apos;chirilgan yoki yaroqsiz bo&apos;lishi mumkin. Iltimos, servis markazi bilan bog&apos;laning.
          </p>
        </div>
      </div>
    );
  }

  // Derive client api base URL: in browser, if NEXT_PUBLIC_API_URL isn't set, default to /api/v1
  const clientApiBase = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

  return <InspectionView inspection={inspection} apiBase={clientApiBase} />;
}
