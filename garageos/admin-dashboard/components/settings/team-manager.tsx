"use client";

import { useEffect, useState } from "react";
import { UserPlus, Wrench, Trash2, Loader2, ChevronDown, Check } from "lucide-react";
import { Button, cn } from "@garageos/design-system";

import { clientFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Master = { id: string; name: string; phone: string | null; service_types: string[] };

function initials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}

// Settings → Team. Add and remove the masters (mechanics) that become lanes on
// the calendar board and options in the booking dropdown.
export function TeamManager() {
  const { t } = useI18n();
  const [masters, setMasters] = useState<Master[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Master | null>(null);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      clientFetch<Master[]>("/staff/mechanics").catch(() => []),
      clientFetch<string[]>("/staff/services").catch(() => []),
    ])
      .then(([m, c]) => {
        setMasters(m);
        setCatalog(c);
      })
      .finally(() => setLoading(false));
  }, []);

  // Toggle one service on a master — optimistic, PUT the full new list, roll
  // back on failure.
  async function toggleService(master: Master, service: string) {
    const has = master.service_types.includes(service);
    const next = has
      ? master.service_types.filter((s) => s !== service)
      : [...master.service_types, service];
    setMasters((prev) => prev.map((m) => (m.id === master.id ? { ...m, service_types: next } : m)));
    try {
      await clientFetch(`/staff/mechanics/${master.id}/services`, {
        method: "PUT",
        body: JSON.stringify({ service_types: next }),
      });
    } catch {
      setMasters((prev) =>
        prev.map((m) => (m.id === master.id ? { ...m, service_types: master.service_types } : m)),
      );
    }
  }

  async function addMaster(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) {
      setError(t("settings.team.name_required"));
      return;
    }
    setSaving(true);
    try {
      const created = await clientFetch<Master>("/staff/mechanics", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null }),
      });
      const withServices = { ...created, service_types: created.service_types ?? [] };
      setMasters((prev) => [...prev, withServices].sort((a, b) => a.name.localeCompare(b.name)));
      setName("");
      setPhone("");
    } catch {
      setError(t("settings.team.add_error"));
    } finally {
      setSaving(false);
    }
  }

  async function removeMaster(master: Master) {
    await clientFetch(`/staff/mechanics/${master.id}`, { method: "DELETE" });
    setMasters((prev) => prev.filter((m) => m.id !== master.id));
    setPendingRemove(null);
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 p-5 border-b border-border">
        <div className="shrink-0 size-10 rounded-xl grid place-items-center bg-primary/10 text-primary">
          <Wrench className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-foreground">{t("settings.team.title")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t("settings.team.subtitle")}</p>
        </div>
        {!loading && masters.length > 0 && (
          <span className="shrink-0 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
            {t("settings.team.count", { count: masters.length })}
          </span>
        )}
      </div>

      {/* Add form */}
      <form onSubmit={addMaster} className="flex flex-col sm:flex-row gap-2 p-5 border-b border-border bg-muted/30">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("settings.team.name_placeholder")}
          aria-label={t("settings.team.name_placeholder")}
          className="flex-1 h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={t("settings.team.phone_placeholder")}
          aria-label={t("settings.team.phone_placeholder")}
          className="sm:w-52 h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <Button
          type="submit"
          size="sm"
          disabled={saving}
          leftIcon={saving ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        >
          {saving ? t("settings.team.adding") : t("settings.team.add")}
        </Button>
      </form>
      {error && <p className="px-5 pt-3 text-sm text-red-600">{error}</p>}

      {/* List */}
      {loading ? (
        <p className="p-5 text-sm text-muted-foreground">{t("settings.team.loading")}</p>
      ) : masters.length === 0 ? (
        <div className="p-10 text-center">
          <div className="mx-auto size-12 rounded-full grid place-items-center bg-muted text-muted-foreground mb-3">
            <Wrench className="size-6" />
          </div>
          <p className="font-semibold text-foreground">{t("settings.team.empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">{t("settings.team.empty_desc")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {masters.map((m) => {
            const open = expandedId === m.id;
            return (
              <li key={m.id} className="px-5 py-3 group hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="shrink-0 size-9 rounded-full grid place-items-center bg-primary/10 text-primary text-sm font-semibold">
                    {initials(m.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                    {m.phone && <p className="text-xs text-muted-foreground truncate">{m.phone}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : m.id)}
                    aria-expanded={open}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    {t("settings.team.services")}
                    {m.service_types.length > 0 && (
                      <span className="ml-0.5 grid min-w-[18px] h-[18px] place-items-center rounded-full bg-primary/10 text-primary text-[10px] font-bold px-1">
                        {m.service_types.length}
                      </span>
                    )}
                    <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingRemove(m)}
                    aria-label={t("settings.team.remove")}
                    className="shrink-0 p-2 rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-600 hover:bg-red-50 transition-all"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {/* Services chips (collapsed) */}
                {!open && m.service_types.length > 0 && (
                  <div className="mt-2 ml-12 flex flex-wrap gap-1.5">
                    {m.service_types.map((s) => (
                      <span key={s} className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-foreground">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {/* Services picker (expanded) */}
                {open && (
                  <div className="mt-3 ml-12 rounded-xl border border-border bg-muted/30 p-3">
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">{t("settings.team.services_pick")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {catalog.map((s) => {
                        const active = m.service_types.includes(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => toggleService(m, s)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/40",
                            )}
                          >
                            {active && <Check className="size-3" />}
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pendingRemove && (
        <ConfirmDialog
          title={t("settings.team.remove_title")}
          message={t("settings.team.remove_msg", { name: pendingRemove.name })}
          confirmLabel={t("settings.team.remove")}
          onConfirm={() => removeMaster(pendingRemove)}
          onClose={() => setPendingRemove(null)}
        />
      )}
    </section>
  );
}
