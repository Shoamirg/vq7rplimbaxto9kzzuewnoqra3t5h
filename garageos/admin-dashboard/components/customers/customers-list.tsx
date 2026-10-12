"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Car, Star, ArrowRight } from "lucide-react";
import { cn } from "@garageos/design-system";

import { EmptyState } from "@/components/states/empty-state";
import type { CustomerListItem } from "@/lib/api/types";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : "—";
const monogram = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

const TIER_CLASS: Record<string, string> = {
  Platinum: "text-violet-600 bg-violet-100 dark:bg-violet-900/30",
  Gold: "text-amber-700 bg-amber-100 dark:bg-amber-900/30",
  Silver: "text-slate-600 bg-slate-100 dark:bg-slate-800",
  Standard: "text-muted-foreground bg-muted",
};

export function CustomersList({ customers }: { customers: CustomerListItem[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return customers;
    return customers.filter((c) =>
      c.full_name.toLowerCase().includes(s) || (c.phone ?? "").includes(s) || (c.email ?? "").toLowerCase().includes(s)
    );
  }, [q, customers]);

  return (
    <div className="p-4 lg:p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Customers</h1>
          <p className="text-sm text-muted-foreground mt-1">{customers.length} customers · sorted by lifetime value.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 max-w-xs w-full">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, email…"
            className="flex-1 bg-transparent py-2.5 text-sm outline-hidden text-foreground placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Car} title="No customers found" description="Try a different search term." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`}
              className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-xs transition-all group">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary font-bold shrink-0">
                  {monogram(c.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{c.full_name}</p>
                    {c.tier !== "Standard" && (
                      <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", TIER_CLASS[c.tier])}>
                        <Star className="size-2.5 fill-current" />{c.tier}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{c.phone ?? c.email ?? "No contact"}</p>
                </div>
                <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1"><Car className="size-3" /> {c.vehicle_count} vehicle{c.vehicle_count !== 1 ? "s" : ""}</span>
                <span className="font-semibold text-foreground">{money(c.lifetime_value)}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Last visit {fmtDate(c.last_visit)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
