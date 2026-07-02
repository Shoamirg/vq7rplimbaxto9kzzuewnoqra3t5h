import { headers } from "next/headers";
import type { Metadata } from "next";
import QRCode from "qrcode";
import { FileWarning } from "lucide-react";

import { getPublicPassport } from "@/lib/api/server";
import { PassportDocument } from "@/components/passport/passport-document";
import { PassportActions } from "@/components/passport/passport-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await getPublicPassport(id).catch(() => null);
  if (!p) return { title: "Vehicle Passport", robots: { index: false } };
  return {
    title: `${p.vehicle.brand} ${p.vehicle.model} · Certified Vehicle Passport`,
    description: `Health ${Math.round(p.health.score)}/100 · verified by ${p.garage.name}.`,
    robots: { index: false },
  };
}

async function verifyUrl(id: string): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}/passport/${id}`;
}

export default async function PassportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const passport = await getPublicPassport(id).catch(() => null);

  if (!passport) {
    return (
      <div className="min-h-screen grid place-items-center bg-muted/30 p-6">
        <div className="max-w-sm text-center space-y-3">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <FileWarning className="size-7" />
          </div>
          <h1 className="text-lg font-semibold text-foreground">Passport not found</h1>
          <p className="text-sm text-muted-foreground">
            This passport link is invalid or has been revoked. Ask the garage for a current link.
          </p>
        </div>
      </div>
    );
  }

  const url = await verifyUrl(id);
  const qrSvg = await QRCode.toString(url, {
    type: "svg",
    margin: 0,
    color: { dark: "#15120C", light: "#00000000" },
  });

  return (
    <div className="min-h-screen bg-[#4c5462] py-8 print:bg-white print:py-0">
      <div className="mx-auto w-[820px] max-w-full">
        <PassportActions />
        <PassportDocument passport={passport} qrSvg={qrSvg} verifyUrl={url} />
      </div>
    </div>
  );
}
