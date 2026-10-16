"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button } from "@garageos/design-system";
import { Logo } from "@/components/brand/logo";
import { useI18n } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/layout/language-switcher';
import { useTheme } from '@/components/providers/theme-provider';
import { staffAuthTransition, AuthTransitionUnavailable, authTransitionMarkerCurrent } from '@/lib/auth-transition';
import { loginFailureKey, retryAfterSeconds } from '@/lib/login-feedback';

// Seeded demo credentials are only offered on local development builds — never
// pre-filled or displayed on a deployed site.
const DEV_DEMO_LOGIN = process.env.NODE_ENV === "development"
  ? { email: "admin@demo.garageos.app", password: "parol12345" }
  : null;

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { resolvedTheme } = useTheme();
  const [revocationUnconfirmed, setRevocationUnconfirmed] = useState(false);
  useEffect(() => {
    const notice = () => {
      const query = new URLSearchParams(window.location.search);
      setRevocationUnconfirmed(query.get('logout') === 'unconfirmed' && authTransitionMarkerCurrent(query.get('auth_epoch')));
    };
    notice();
    window.addEventListener('storage', notice);
    return () => window.removeEventListener('storage', notice);
  }, []);
  const [email, setEmail] = useState(DEV_DEMO_LOGIN?.email ?? "");
  const [password, setPassword] = useState(DEV_DEMO_LOGIN?.password ?? "");
  const [error, setError] = useState<{ key: string; retryUntil?: number } | null>(null);
  const [clock, setClock] = useState(Date.now);
  const [isLoading, setIsLoading] = useState(false);
  const wait = error?.retryUntil ? Math.max(0, Math.ceil((error.retryUntil - clock) / 1000)) : 0;
  useEffect(() => {
    if (!error?.retryUntil) return;
    const until = error.retryUntil;
    const timer = window.setInterval(() => {
      const now = Date.now(); setClock(now);
      if (now >= until) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [error?.retryUntil]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isLoading || wait > 0) return;
    setIsLoading(true);
    setError(null);
    setRevocationUnconfirmed(false);
    try {
      await staffAuthTransition(async (current, _marker, complete) => {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const delay = res.status === 429 ? retryAfterSeconds(res.headers.get('retry-after')) : null;
          if (current()) {
            const now = Date.now(); setClock(now);
            setError({ key: loginFailureKey(res.status, data?.code), ...(delay && delay > 0 ? { retryUntil: now + delay * 1000 } : {}) });
          }
          return;
        }
        const result = await res.json().catch(() => null);
        if (!current()) return;
        if (result?.ok !== true || !['/dashboard', '/platform', '/mechanic/work'].includes(result.redirectTo)) {
          setError({ key: 'platform.login_invalid_response' }); return;
        }
        complete();
        router.replace(result.redirectTo);
        router.refresh();
      });
    } catch (error) {
      setError({ key: error instanceof AuthTransitionUnavailable ? 'platform.auth_coordination_unavailable' : 'platform.login_connection' });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-1.5">
          <Logo size={26} theme={resolvedTheme} />
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{t('platform.login_tagline')}</p>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-lg p-6 space-y-5">
          <div className="flex justify-end"><LanguageSwitcher /></div>
          {revocationUnconfirmed && <p role="alert" className="text-sm text-foreground">{t('platform.logout_unconfirmed')}</p>}
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t('platform.login_title')}</h1>
            <p className="text-sm text-muted-foreground">{t('platform.login_subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-foreground">{t('platform.login_email')}</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-hidden focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-foreground">{t('platform.login_password')}</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-hidden focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {error && (
              <p className="text-sm text-danger-dark dark:text-danger-light" role="alert">{wait > 0 ? t('platform.login_rate_limited_wait', { seconds: wait }) : t(error.key)}</p>
            )}

            <Button type="submit" fullWidth loading={isLoading} disabled={wait > 0} leftIcon={<LogIn className="size-4" />}>
              {t('platform.login_submit')}
            </Button>
          </form>

          {DEV_DEMO_LOGIN && (
            <p className="text-xs text-muted-foreground text-center">
              {t('platform.login_demo_hint')} <span className="font-mono">{DEV_DEMO_LOGIN.email}</span> / <span className="font-mono">{DEV_DEMO_LOGIN.password}</span>
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
