"use client";

import { useEffect } from "react";
import { Eye } from "lucide-react";
import { useToast } from "@garageos/design-system";

// Persistent bar shown only during a read-only demo session. Also listens for the
// `garageos:demo-blocked` event (dispatched by clientFetch when the backend rejects
// a write) and explains, instead of letting the action fail silently.
export function DemoBanner() {
  const { toast } = useToast();

  useEffect(() => {
    const onBlocked = () =>
      toast({ title: "You're in the live demo", description: "Changes are disabled here. Book a demo to try it for real.", variant: "info" });
    window.addEventListener("garageos:demo-blocked", onBlocked);
    return () => window.removeEventListener("garageos:demo-blocked", onBlocked);
  }, [toast]);

  return (
    <div
      role="status"
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap",
        padding: "8px 16px", fontSize: 13.5, fontWeight: 500,
        color: "var(--color-foreground)", background: "var(--color-muted)", borderRadius: 18,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
        <Eye size={15} /> You{"’"}re exploring a live demo — it{"’"}s read-only, so nothing you click changes the data.
      </span>
      <a
        href="mailto:hello@garageos.app?subject=GarageOS%20demo%20request"
        style={{ color: "inherit", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 2 }}
      >
        Book a real demo
      </a>
    </div>
  );
}
