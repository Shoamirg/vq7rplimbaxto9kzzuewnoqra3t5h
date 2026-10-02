"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Car, Star, ArrowRight, UserPlus } from "lucide-react";
import { Button, cn } from "@garageos/design-system";

import { EmptyState } from "@/components/states/empty-state";
import { NewCustomerModal } from "@/components/customers/new-customer-modal";
import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/dictionaries";
import { formatDate, formatNumber } from "@/lib/i18n/format";
import type { CustomerListItem } from "@/lib/api/types";

const money = (n: number, locale: Locale) => `$${formatNumber(locale, Math.round(n))}`;
const fmtDate = (iso: string | null, locale: Locale) =>
  iso ? formatDate(locale, iso, { day: "numeric", month: "short", year: "numeric" }) : "—";
const monogram = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

const TIER_CLASS: Record<string, string> = {
  Platinum: "text-violet-600 bg-violet-100 dark:bg-violet-900/30",
  Gold: "text-amber-700 bg-amber-100 dark:bg-amber-900/30",
  Silver: "text-slate-600 bg-slate-100 dark:bg-slate-800",
  Standard: "text-muted-foreground bg-muted",
};

export function CustomersList({ customers }: { customers: CustomerListItem[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
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
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("cust.list.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("cust.list.subtitle", { count: customers.length })}</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 flex-1 sm:max-w-xs">
            <Search className="size-4 text-muted-foreground shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("cust.list.search_placeholder")}
              className="flex-1 bg-transparent py-2.5 text-sm outline-none text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          <Button size="sm" onClick={() => setAddOpen(true)} leftIcon={<UserPlus className="size-4" />}>
            {t("customers.new.button")}
          </Button>
        </div>
      </div>

      {addOpen && (
        <NewCustomerModal
          onClose={() => setAddOpen(false)}
          onCreated={(c) => { setAddOpen(false); router.push(`/customers/${c.id}`); }}
        />
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Car}
          title={customers.length === 0 ? t("cust.list.empty_title") : t("cust.list.no_results_title")}
          description={customers.length === 0 ? t("cust.list.empty_desc") : t("cust.list.no_results_desc")}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <Link key={c.id} href={`/customers/${c.id}`}
              className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all group">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary font-bold shrink-0">
                  {monogram(c.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{c.full_name}</p>
                    {c.tier !== "Standard" && (
                      <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", TIER_CLASS[c.tier])}>
                        <Star className="size-2.5 fill-current" />{c.tier in TIER_CLASS ? t(`cust.tier.${c.tier}`) : c.tier}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{c.phone ?? c.email ?? t("cust.card.no_contact")}</p>
                </div>
                <ArrowRight className="size-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1"><Car className="size-3" /> {t("cust.card.vehicles", { count: c.vehicle_count })}</span>
                <span className="font-semibold text-foreground">{money(c.lifetime_value, locale)}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{t("cust.card.last_visit")} {fmtDate(c.last_visit, locale)}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
