"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CalendarClock, Car, QrCode, Users, DollarSign, ShieldAlert, Cog } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, cn,
} from "@garageos/design-system";

import { clientFetch } from "@/lib/api/client";
import type { NotificationFeed, NotificationItem, NotificationSeverity } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/context";

const SEVERITY_DOT: Record<NotificationSeverity, string> = {
  critical: "bg-red-600", high: "bg-red-500", medium: "bg-amber-500", low: "bg-primary-500", info: "bg-slate-400",
};

const CATEGORY_ICON: Record<string, React.ElementType> = {
  appointment: CalendarClock, vehicle: Car, passport: QrCode, customer: Users,
  finance: DollarSign, emergency: ShieldAlert, system: Cog,
};

const FILTERS = ["all", "appointment", "vehicle", "passport", "customer"] as const;

export function NotificationBell() {
  const { t, tp, fmt } = useI18n();
  function relTime(iso: string): string {
    const timestamp = new Date(iso).getTime();
    if (!Number.isFinite(timestamp)) return "—";
    const minutes = Math.round((Date.now() - timestamp) / 60000);
    if (minutes < 1) return t("feedback.just_now");
    if (minutes < 60) return tp("feedback.minutes", minutes, { count: fmt.number(minutes) });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return tp("feedback.hours", hours, { count: fmt.number(hours) });
    const days = Math.round(hours / 24);
    return days === 1 ? t("feedback.yesterday") : tp("feedback.days", days, { count: fmt.number(days) });
  }

  const router = useRouter();
  const [feed, setFeed] = useState<NotificationFeed>({ items: [], unread_count: 0 });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [open, setOpen] = useState(false);

  const load = useCallback(async (cat: string) => {
    try {
      const q = cat && cat !== "all" ? `?category=${cat}` : "";
      setFeed(await clientFetch<NotificationFeed>(`/notifications${q}`));
    } catch { /* keep last */ }
  }, []);

  // Initial + light polling for the unread badge.
  useEffect(() => { load("all"); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (!open) load(filter); }, 30_000);
    return () => clearInterval(t);
  }, [open, filter, load]);
  useEffect(() => { if (open) load(filter); }, [open, filter, load]);

  const markAllRead = async () => {
    try {
      await clientFetch("/notifications/read-all", { method: "POST" });
      setFeed((f) => ({ items: f.items.map((n) => ({ ...n, is_read: true })), unread_count: 0 }));
    } catch { /* ignore */ }
  };

  const openItem = async (n: NotificationItem) => {
    setOpen(false);
    if (!n.is_read) {
      clientFetch(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
      setFeed((f) => ({
        items: f.items.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)),
        unread_count: Math.max(0, f.unread_count - 1),
      }));
    }
    if (n.link) router.push(n.link);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="relative grid size-11 place-items-center rounded-lg hover:bg-muted transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("menu.notifications")}>
          <Bell className="size-4 text-muted-foreground" />
          {feed.unread_count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-[16px] h-4 place-items-center rounded-full bg-red-700 px-1 text-[9px] font-bold text-white">
              {feed.unread_count > 9 ? "9+" : feed.unread_count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[380px] max-w-[calc(100vw-1rem)] p-0" maxHeight="480px">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2.5 border-b border-border">
          <p className="text-sm font-semibold text-foreground">
            {t("menu.notifications")} {feed.unread_count > 0 && <span className="text-muted-foreground font-normal">· {tp("feedback.new", feed.unread_count, { count: fmt.number(feed.unread_count) })}</span>}
          </p>
          <button onClick={markAllRead} className="flex min-h-11 items-center gap-1 text-left text-xs text-muted-foreground hover:text-foreground">
            <Check className="size-3 shrink-0" /> {t("feedback.mark_all_read")}
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 px-2 py-2 border-b border-border overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn(
                "min-h-11 min-w-11 px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-colors",
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {t(`feedback.filter.${f}`)}
            </button>
          ))}
        </div>

        {/* Feed */}
        <div className="max-h-[340px] overflow-y-auto">
          {feed.items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Bell className="size-7 mx-auto mb-2 opacity-40" />
              {t("feedback.empty_notifications")}
            </div>
          ) : (
            feed.items.map((n) => {
              const Icon = CATEGORY_ICON[n.category] ?? Bell;
              return (
                <button
                  key={n.id}
                  onClick={() => openItem(n)}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left border-b border-border/60 last:border-0 hover:bg-muted/50 transition-colors",
                    !n.is_read && "bg-primary/3"
                  )}
                >
                  <span className="relative mt-0.5 grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground shrink-0">
                    <Icon className="size-4" />
                    <span className={cn("absolute -top-0.5 -left-0.5 size-2 rounded-full ring-2 ring-background", SEVERITY_DOT[n.severity])} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("text-sm truncate", n.is_read ? "text-foreground/80" : "text-foreground font-medium")}>{n.title}</span>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">{relTime(n.created_at)}</span>
                    </span>
                    {n.body && <span className="block text-xs text-muted-foreground truncate">{n.body}</span>}
                  </span>
                  {!n.is_read && <span className="mt-1.5 size-2 rounded-full bg-primary shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
