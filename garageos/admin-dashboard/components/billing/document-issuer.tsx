import type { InvoiceIssuer } from "@/lib/api/types";

// Pure presentation shared by the client workspace and standalone SSR page.
// Recorded free text stays text; no demo identity/contact fallback is supplied.
export function DocumentIssuer({ issuer, fallbackName, accent }: {
  issuer?: InvoiceIssuer | null; fallbackName: string; accent: string;
}) {
  const name = issuer?.name || fallbackName;
  const monogram = issuer?.monogram || Array.from(name)[0];
  const phone = issuer?.phone;
  const number = phone?.replace(/[^\d+]/g, "");
  const callable = phone && /^[+\d\s().-]+$/.test(phone) && number && /^\+?\d{3,15}$/.test(number);

  return (
    <div data-document-issuer className="flex min-w-0 flex-1 basis-full sm:basis-auto items-start gap-3">
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl text-base font-extrabold" style={{ background: accent }}>{monogram}</span>
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <p className="text-[17px] font-extrabold leading-tight">{name}</p>
        {issuer?.tagline && <p className="mt-1 text-xs text-slate-300">{issuer.tagline}</p>}
        {phone && (callable ? <a href={`tel:${number}`} className="inline-flex min-h-11 min-w-11 items-center text-xs text-slate-300 underline underline-offset-4">{phone}</a>
          : <p className="mt-1 text-xs text-slate-300">{phone}</p>)}
        {issuer?.address && <p className="mt-1 text-xs text-slate-300">{issuer.address}</p>}
      </div>
    </div>
  );
}
