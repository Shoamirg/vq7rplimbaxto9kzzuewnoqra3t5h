import {
  Car, Wrench, Calendar, Users, Gauge, Bell, Settings, Search,
  CheckCircle2, AlertTriangle, Clock, DollarSign,
} from "lucide-react";
import { Section, Subsection, Swatch } from "./kit";

const SEMANTIC = [
  { token: "primary", className: "bg-primary" },
  { token: "success", className: "bg-success" },
  { token: "warning", className: "bg-warning" },
  { token: "danger", className: "bg-danger" },
  { token: "foreground", className: "bg-foreground" },
  { token: "muted", className: "bg-muted" },
  { token: "card", className: "bg-card" },
  { token: "accent", className: "bg-accent" },
];

const HEALTH = [
  { token: "excellent", className: "bg-emerald-500" },
  { token: "good", className: "bg-green-500" },
  { token: "fair", className: "bg-amber-500" },
  { token: "poor", className: "bg-red-500" },
];

const SPACES = [
  ["1", "0.25rem", "w-1"], ["2", "0.5rem", "w-2"], ["3", "0.75rem", "w-3"],
  ["4", "1rem", "w-4"], ["6", "1.5rem", "w-6"], ["8", "2rem", "w-8"],
  ["12", "3rem", "w-12"], ["16", "4rem", "w-16"],
] as const;

const ICONS = [Car, Wrench, Calendar, Users, Gauge, Bell, Settings, Search, CheckCircle2, AlertTriangle, Clock, DollarSign];

export function Foundations() {
  return (
    <Section id="foundations" kicker="Foundations" title="Type, color, spacing & icons">
      {/* Typography */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Typography</h3>
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          <div className="p-4 flex items-baseline justify-between gap-4">
            <span className="text-3xl font-bold tracking-tight text-foreground">Operations, at a glance</span>
            <span className="text-xs font-mono text-muted-foreground">3xl / bold</span>
          </div>
          <div className="p-4 flex items-baseline justify-between gap-4">
            <span className="text-2xl font-bold tracking-tight text-foreground">Section heading</span>
            <span className="text-xs font-mono text-muted-foreground">2xl / bold</span>
          </div>
          <div className="p-4 flex items-baseline justify-between gap-4">
            <span className="text-base text-foreground">Body copy — the workhorse text size for descriptions and content.</span>
            <span className="text-xs font-mono text-muted-foreground">base</span>
          </div>
          <div className="p-4 flex items-baseline justify-between gap-4">
            <span className="text-sm text-muted-foreground">Muted secondary text</span>
            <span className="text-xs font-mono text-muted-foreground">sm / muted</span>
          </div>
          <div className="p-4 flex items-baseline justify-between gap-4">
            <span className="text-xs font-medium uppercase tracking-widest text-primary">Overline label</span>
            <span className="text-xs font-mono text-muted-foreground">xs / tracked</span>
          </div>
        </div>
      </div>

      {/* Colors */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Semantic color</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {SEMANTIC.map((s) => <Swatch key={s.token} {...s} />)}
        </div>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Health bands</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {HEALTH.map((s) => <Swatch key={s.token} {...s} />)}
        </div>
      </div>

      {/* Spacing */}
      <Subsection title="Spacing scale" className="flex-col items-start gap-2">
        {SPACES.map(([name, rem, w]) => (
          <div key={name} className="flex items-center gap-3">
            <span className="w-8 text-xs font-mono text-muted-foreground">{name}</span>
            <div className={`${w} h-4 rounded bg-primary`} />
            <span className="text-xs text-muted-foreground">{rem}</span>
          </div>
        ))}
      </Subsection>

      {/* Icons */}
      <Subsection title="Icons (lucide)">
        {ICONS.map((Icon, i) => (
          <div key={i} className="grid place-items-center size-11 rounded-lg border border-border bg-card text-foreground">
            <Icon className="size-5" />
          </div>
        ))}
      </Subsection>
    </Section>
  );
}
