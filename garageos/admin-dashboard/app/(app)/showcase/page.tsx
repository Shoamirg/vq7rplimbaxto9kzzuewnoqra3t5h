import type { Metadata } from "next";

import { Foundations } from "@/components/showcase/foundations";
import { ComponentsSection } from "@/components/showcase/components-section";
import { GarageSection } from "@/components/showcase/garage-section";
import { PatternsSection } from "@/components/showcase/patterns-section";

// Internal design-system catalog — Storybook-in-app. Every polished component
// gets a home here so the product stays visually consistent as it grows.
// Hidden (not in the sidebar); reach it directly at /showcase.
export const metadata: Metadata = { title: "Design System · GarageOS", robots: { index: false } };

const NAV = [
  { id: "foundations", label: "Foundations" },
  { id: "components", label: "Components" },
  { id: "garage", label: "Garage Components" },
  { id: "patterns", label: "Patterns" },
];

export default function ShowcasePage() {
  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-6">
      {/* Header */}
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-primary">Internal</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Design System</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The single source of visual truth for GarageOS. Anything redesigned gets added here.
        </p>
      </header>

      {/* Sticky in-page nav */}
      <nav className="sticky top-0 z-10 -mx-4 mb-8 flex flex-wrap gap-2 border-b border-border bg-background/90 px-4 py-3 backdrop-blur lg:-mx-6 lg:px-6">
        {NAV.map((n) => (
          <a
            key={n.id}
            href={`#${n.id}`}
            className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            {n.label}
          </a>
        ))}
      </nav>

      <div className="space-y-16 pb-24">
        <Foundations />
        <ComponentsSection />
        <GarageSection />
        <PatternsSection />
      </div>
    </div>
  );
}
