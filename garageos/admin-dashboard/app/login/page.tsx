"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button } from "@garageos/design-system";
import { Logo } from "@/components/brand/logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@demo.garageos.app");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Login failed");
        return;
      }
      const data = (await res.json()) as { redirectTo?: string };
      const destination = data.redirectTo === "/work-orders" ? "/work-orders" : "/dashboard";
      router.replace(destination);
      router.refresh();
    } catch {
      setError("Could not reach the server. Is the backend running?");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center bg-linear-to-br from-primary/5 via-background to-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-1.5">
          <Logo size={26} theme="light" />
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Vehicle Intelligence</p>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-lg p-6 space-y-5">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Sign in</h1>
            <p className="text-sm text-muted-foreground">Access your garage dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-foreground">Email</label>
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
              <label htmlFor="password" className="text-sm font-medium text-foreground">Password</label>
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
              <p className="text-sm text-danger" role="alert">{error}</p>
            )}

            <Button type="submit" fullWidth loading={isLoading} leftIcon={<LogIn className="size-4" />}>
              Sign in
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center">
            Demo: <span className="font-mono">admin@demo.garageos.app</span> / <span className="font-mono">demo1234</span>
          </p>
        </div>
      </div>
    </main>
  );
}
