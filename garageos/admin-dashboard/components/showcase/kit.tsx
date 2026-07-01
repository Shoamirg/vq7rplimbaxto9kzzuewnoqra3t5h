import { cn } from "@/lib/utils";

// Small building blocks for the /showcase catalog so every section reads
// consistently: a titled section, a labelled specimen frame, and swatches.

export function Section({ id, title, kicker, children }: {
  id: string; title: string; kicker?: string; children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 space-y-6">
      <div className="border-b border-border pb-3">
        {kicker && <p className="text-xs font-medium uppercase tracking-widest text-primary">{kicker}</p>}
        <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
      </div>
      <div className="space-y-8">{children}</div>
    </section>
  );
}

export function Subsection({ title, children, className }: {
  title: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <div className={cn("flex flex-wrap items-end gap-4", className)}>{children}</div>
    </div>
  );
}

/** A framed preview surface for a component specimen, with an optional label. */
export function Specimen({ label, children, className }: {
  label?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className="space-y-2">
      <div className={cn("rounded-xl border border-border bg-card p-6 grid place-items-center", className)}>
        {children}
      </div>
      {label && <p className="text-xs text-center text-muted-foreground font-mono">{label}</p>}
    </div>
  );
}

export function Swatch({ token, className }: { token: string; className: string }) {
  return (
    <div className="space-y-1.5">
      <div className={cn("h-16 w-full rounded-lg border border-border", className)} />
      <p className="text-xs font-mono text-muted-foreground">{token}</p>
    </div>
  );
}
