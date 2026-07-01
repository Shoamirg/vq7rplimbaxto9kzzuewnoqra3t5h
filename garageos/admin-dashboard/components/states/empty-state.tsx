import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@garageos/design-system";
import { cn } from "@/lib/utils";

type Action =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

// A handcrafted empty state: a reason the space is empty, and the one obvious
// next step. Never just "No data." Used across surfaces for consistency.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondary,
  className,
  compact = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: Action;
  secondary?: Action;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid place-items-center text-center", compact ? "py-10" : "py-16", className)}>
      <div className="max-w-sm space-y-3 px-4">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <Icon className="size-7" />
        </div>
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
        {(action || secondary) && (
          <div className="flex items-center justify-center gap-2 pt-1">
            {action && <ActionButton action={action} />}
            {secondary && <ActionButton action={secondary} variant="ghost" />}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({ action, variant = "primary" }: { action: Action; variant?: "primary" | "ghost" }) {
  if (action.href) {
    return (
      <Link href={action.href}>
        <Button variant={variant} size="sm">{action.label}</Button>
      </Link>
    );
  }
  return (
    <Button variant={variant} size="sm" onClick={action.onClick}>
      {action.label}
    </Button>
  );
}
