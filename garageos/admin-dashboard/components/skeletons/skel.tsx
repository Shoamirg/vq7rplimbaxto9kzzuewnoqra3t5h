import { cn } from "@/lib/utils";

// Shared skeleton primitives. A "handcrafted" skeleton mirrors the real
// layout's structure (card shapes, gauge rings, lane columns) so the page
// doesn't visibly jump when data arrives — it just fills in.
//
// Matches the design-system block style (animate-pulse + muted). Kept local so
// page skeletons can compose them freely; also surfaced in /showcase → Patterns.

export function Bar({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn("animate-pulse rounded-md bg-muted/70", className)} style={style} />;
}

/** A hollow ring, for gauge placeholders. Border color via Tailwind (resolves
 *  the theme token); size/stroke inline so callers can scale it. */
export function Ring({ size = 148, stroke = 12 }: { size?: number; stroke?: number }) {
  return (
    <div
      className="animate-pulse rounded-full border-muted/70"
      style={{ width: size, height: size, borderWidth: stroke, borderStyle: "solid" }}
    />
  );
}

/** Small circular block (avatars, status dots, icon chips). */
export function Circle({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-full bg-muted/70", className)} />;
}

/** A bordered card surface that wraps skeleton content, matching real cards. */
export function CardShell({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5", className)}>{children}</div>
  );
}
