import type { Metadata } from "next";
import { FileWarning } from "lucide-react";

import { getPublicInvoice } from "@/lib/api/server";
import { PublicInvoice } from "@/components/billing/public-invoice";
import { PrintButton } from "@/components/billing/print-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const doc = await getPublicInvoice(id).catch(() => null);
  if (!doc) return { title: "Invoice", robots: { index: false } };
  return { title: `${doc.kind === "estimate" ? "Estimate" : "Invoice"} ${doc.code}`, robots: { index: false } };
}

export default async function PublicInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getPublicInvoice(id).catch(() => null);

  if (!doc) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-100 p-6">
        <div className="max-w-sm text-center space-y-3">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-slate-200 text-slate-500"><FileWarning className="size-7" /></div>
          <h1 className="text-lg font-semibold text-slate-800">Document not found</h1>
          <p className="text-sm text-slate-500">This link is invalid or has been revoked. Ask the garage for a current link.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 py-8 print:bg-white print:py-0">
      <div className="mx-auto w-[820px] max-w-full px-4 print:px-0">
        <div className="mb-3 flex justify-end print:hidden"><PrintButton /></div>
        <PublicInvoice doc={doc} />
      </div>
    </div>
  );
}
