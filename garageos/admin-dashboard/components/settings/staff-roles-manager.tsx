"use client";

import { useEffect, useState } from "react";
import { UserPlus, ShieldCheck, Trash2, Loader2 } from "lucide-react";
import { Button } from "@garageos/design-system";

import { clientFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/context";
import { useAuth } from "@/lib/auth/context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Member = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string | null;
  is_super_admin: boolean;
};
type RoleOption = { name: string };

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

// Settings → Staff & access (admin-only). Lists every staff member of the garage
// with their access role, and lets an admin add staff, change roles, and remove
// them. The API enforces the same admin gate + self-lockout guards; this UI just
// surfaces them.
export function StaffRolesManager() {
  const { t } = useI18n();
  const me = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<Member | null>(null);

  useEffect(() => {
    Promise.all([
      clientFetch<Member[]>("/staff/members").catch(() => []),
      clientFetch<RoleOption[]>("/staff/roles").catch(() => []),
    ])
      .then(([m, r]) => {
        setMembers(m);
        setRoles(r);
        setRole(r[0]?.name ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  const roleLabel = (name: string | null) =>
    name ? t(`role.${name}`) : t("settings.staff.no_role");

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2 || !email.trim() || !role) {
      setError(t("settings.staff.fields_required"));
      return;
    }
    if (password.length < 6) {
      setError(t("settings.staff.password_short"));
      return;
    }
    setSaving(true);
    try {
      const created = await clientFetch<Member>("/staff/members", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          role,
          password,
        }),
      });
      setMembers((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setName("");
      setEmail("");
      setPassword("");
    } catch {
      setError(t("settings.staff.add_error"));
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(member: Member, next: string) {
    const previous = member.role;
    // Optimistic: reflect immediately, roll back on failure.
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, role: next } : m)),
    );
    try {
      await clientFetch(`/staff/members/${member.id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: next }),
      });
    } catch {
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, role: previous } : m)),
      );
      setError(t("settings.staff.role_error"));
    }
  }

  async function removeMember(member: Member) {
    try {
      await clientFetch(`/staff/members/${member.id}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    } catch {
      setError(t("settings.staff.remove_error"));
    } finally {
      setPendingRemove(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 p-5 border-b border-border">
        <div className="shrink-0 size-10 rounded-xl grid place-items-center bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-foreground">{t("settings.staff.title")}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{t("settings.staff.subtitle")}</p>
        </div>
        {!loading && members.length > 0 && (
          <span className="shrink-0 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
            {t("settings.staff.count", { count: members.length })}
          </span>
        )}
      </div>

      {/* Add form */}
      <form onSubmit={addMember} className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-5 border-b border-border bg-muted/30">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("settings.staff.name_placeholder")}
          aria-label={t("settings.staff.name_placeholder")}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("settings.staff.email_placeholder")}
          aria-label={t("settings.staff.email_placeholder")}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label={t("settings.staff.role_label")}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {roles.map((r) => (
            <option key={r.name} value={r.name}>
              {t(`role.${r.name}`)}
            </option>
          ))}
        </select>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("settings.staff.password_placeholder")}
          aria-label={t("settings.staff.password_placeholder")}
          autoComplete="new-password"
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="sm:col-span-2 flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={saving}
            leftIcon={saving ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          >
            {saving ? t("settings.staff.adding") : t("settings.staff.add")}
          </Button>
        </div>
      </form>
      {error && <p className="px-5 pt-3 text-sm text-red-600">{error}</p>}

      {/* List */}
      {loading ? (
        <p className="p-5 text-sm text-muted-foreground">{t("settings.staff.loading")}</p>
      ) : members.length === 0 ? (
        <div className="p-10 text-center">
          <div className="mx-auto size-12 rounded-full grid place-items-center bg-muted text-muted-foreground mb-3">
            <ShieldCheck className="size-6" />
          </div>
          <p className="font-semibold text-foreground">{t("settings.staff.empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">{t("settings.staff.empty_desc")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {members.map((m) => {
            const isSelf = m.id === me?.id;
            const locked = m.is_super_admin || m.role === "super_admin";
            return (
              <li key={m.id} className="flex items-center gap-3 px-5 py-3 group hover:bg-muted/40 transition-colors">
                <div className="shrink-0 size-9 rounded-full grid place-items-center bg-primary/10 text-primary text-sm font-semibold">
                  {initials(m.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {m.name}
                    {isSelf && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{t("settings.staff.you")}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                </div>

                {locked ? (
                  <span className="shrink-0 text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                    {roleLabel(m.role)}
                  </span>
                ) : (
                  <select
                    value={m.role ?? ""}
                    onChange={(e) => changeRole(m, e.target.value)}
                    aria-label={t("settings.staff.role_for", { name: m.name })}
                    className="shrink-0 h-8 rounded-lg border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {roles.map((r) => (
                      <option key={r.name} value={r.name}>
                        {t(`role.${r.name}`)}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => setPendingRemove(m)}
                  disabled={isSelf || locked}
                  aria-label={t("settings.staff.remove")}
                  className="shrink-0 p-2 rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-0 disabled:pointer-events-none"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {pendingRemove && (
        <ConfirmDialog
          title={t("settings.staff.remove_title")}
          message={t("settings.staff.remove_msg", { name: pendingRemove.name })}
          confirmLabel={t("settings.staff.remove")}
          onConfirm={() => removeMember(pendingRemove)}
          onClose={() => setPendingRemove(null)}
        />
      )}
    </section>
  );
}
