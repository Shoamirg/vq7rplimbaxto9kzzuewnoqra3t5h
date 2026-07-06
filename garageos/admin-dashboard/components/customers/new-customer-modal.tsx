"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { UserPlus, Loader2, X } from "lucide-react";
import { Button } from "@garageos/design-system";

import { clientFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";

type Created = { id: string; full_name: string };

const FIELD =
  "w-full h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const LABEL = "block text-xs font-medium text-muted-foreground mb-1";

// Create a customer. Portaled to body so it escapes the sidebar's transform.
export function NewCustomerModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: Created) => void;
}) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) {
      setError(t("customers.new.name_required"));
      return;
    }
    setSaving(true);
    try {
      const created = await clientFetch<Created>("/customers", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: address.trim() || null,
        }),
      });
      onCreated(created);
    } catch {
      setError(t("customers.new.error"));
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={saving ? undefined : onClose} />
      <form
        onSubmit={submit}
        className="relative w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <UserPlus className="size-5 text-primary" /> {t("customers.new.title")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.cancel")} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className={LABEL} htmlFor="cust-name">{t("customers.new.name")}</label>
            <input id="cust-name" autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("customers.new.name_ph")} className={FIELD} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL} htmlFor="cust-phone">{t("customers.new.phone")}</label>
              <input id="cust-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("customers.new.phone_ph")} className={FIELD} />
            </div>
            <div>
              <label className={LABEL} htmlFor="cust-email">{t("customers.new.email")}</label>
              <input id="cust-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("customers.new.email_ph")} className={FIELD} />
            </div>
          </div>
          <div>
            <label className={LABEL} htmlFor="cust-address">{t("customers.new.address")}</label>
            <input id="cust-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("customers.new.address_ph")} className={FIELD} />
          </div>
          <p className="text-xs text-muted-foreground">{t("customers.new.hint")}</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>{t("common.cancel")}</Button>
          <Button type="submit" size="sm" disabled={saving} leftIcon={saving ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}>
            {saving ? t("customers.new.saving") : t("customers.new.save")}
          </Button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
