"use client";

import React from "react";
import { ButtonDemo } from "../../../../packages/design-system/ui/button/button.demo";
import { SpinnerDemo } from "../../../../packages/design-system/ui/spinner/spinner.demo";
import { InputDemo } from "../../../../packages/design-system/ui/input/input.demo";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../../../../packages/design-system/ui/card";
import { Badge } from "../../../../packages/design-system/ui/badge";
import { Avatar, AvatarGroup } from "../../../../packages/design-system/ui/avatar";
import { Skeleton } from "../../../../packages/design-system/ui/skeleton";

export default function ComponentsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation tabs */}
      <div className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xs">
        <div className="flex items-center gap-1 p-2 max-w-6xl mx-auto overflow-x-auto">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="shrink-0 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              {section.label}
            </a>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto py-8 px-4 space-y-20">
        {/* Header */}
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            GarageOS Design System
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Component catalog — each component is a reusable, accessible, theme-aware building block.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Badge variant="primary">Phase 1 Complete</Badge>
            <Badge variant="success">7 Components</Badge>
            <Badge variant="neutral">Dark/Light Ready</Badge>
          </div>
        </header>

        {/* Sections */}
        <Section id="button" label="Button" description="7 variants, 5 sizes, loading, icons, full-width">
          <ButtonDemo />
        </Section>

        <Section id="spinner" label="Spinner" description="4 sizes, labels, centered/inline modes">
          <SpinnerDemo />
        </Section>

        <Section id="input" label="Input" description="3 sizes, labels, icons, error/success, clearable, password toggle, counter">
          <InputDemo />
        </Section>

        <Section id="card" label="Card" description="4 variants, header/content/footer, loading & empty states">
          <CardExamples />
        </Section>

        <Section id="badge" label="Badge" description="7 variants, 3 sizes, dot indicator, pill shape">
          <BadgeExamples />
        </Section>

        <Section id="avatar" label="Avatar" description="5 sizes, image/initials/icon fallback, status indicator, groups">
          <AvatarExamples />
        </Section>

        <Section id="skeleton" label="Skeleton" description="Text, avatar, card, table-row, chart loading primitives">
          <SkeletonExamples />
        </Section>
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────
function Section({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-16 space-y-6">
      <div className="border-b border-border pb-3">
        <h2 className="text-xl font-semibold text-foreground">{label}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-6">
        {children}
      </div>
    </section>
  );
}

// ─── Navigation ───────────────────────────────────────────────
const sections = [
  { id: "button", label: "Button" },
  { id: "spinner", label: "Spinner" },
  { id: "input", label: "Input" },
  { id: "card", label: "Card" },
  { id: "badge", label: "Badge" },
  { id: "avatar", label: "Avatar" },
  { id: "skeleton", label: "Skeleton" },
];

// ─── Card Examples ────────────────────────────────────────────
function CardExamples() {
  const [cardCount, setCardCount] = React.useState(0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card variant="default">
          <CardHeader>
            <CardTitle>Default Card</CardTitle>
            <CardDescription>Standard card with border and shadow</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This is the default card style used throughout GarageOS.
            </p>
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">Footer content</p>
          </CardFooter>
        </Card>

        <Card variant="elevated">
          <CardHeader>
            <CardTitle>Elevated Card</CardTitle>
            <CardDescription>Card with larger shadow for emphasis</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Use elevated cards for important widgets and modals.
            </p>
          </CardContent>
        </Card>

        <Card variant="muted">
          <CardHeader>
            <CardTitle>Muted Card</CardTitle>
            <CardDescription>Subtle background for secondary content</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Great for sidebars, stats, and less prominent information.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card loading />
        <Card
          empty
          emptyMessage="No vehicles registered"
          emptyAction={
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors">
              + Register Vehicle
            </button>
          }
        />
        <Card
          variant="outline"
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setCardCount((c) => c + 1)}
        >
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm font-medium text-foreground">Interactive Card</p>
            <p className="text-xs text-muted-foreground mt-1">
              Clicked {cardCount} times
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Badge Examples ────────────────────────────────────────────
function BadgeExamples() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Variants</h3>
        <div className="flex flex-wrap items-center gap-2">
          {(["default", "primary", "success", "warning", "danger", "info", "neutral"] as const).map((v) => (
            <Badge key={v} variant={v}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Sizes</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge size="sm" variant="primary">Small</Badge>
          <Badge size="md" variant="primary">Medium</Badge>
          <Badge size="lg" variant="primary">Large</Badge>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">With Dot Indicators</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success" dot>Active</Badge>
          <Badge variant="warning" dot>Pending</Badge>
          <Badge variant="danger" dot>Overdue</Badge>
          <Badge variant="info" dot>Scheduled</Badge>
          <Badge variant="neutral" dot>Draft</Badge>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Pill Shape</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success" pill dot>Completed</Badge>
          <Badge variant="warning" pill>In Progress</Badge>
          <Badge variant="danger" pill dot>Urgent</Badge>
        </div>
      </div>

      <div className="border border-border rounded-lg p-4 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">GarageOS Usage Examples</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success" dot>Healthy</Badge>
          <Badge variant="warning" dot>Due Soon</Badge>
          <Badge variant="danger" dot>Overdue</Badge>
          <Badge variant="info">Oil Change</Badge>
          <Badge variant="primary" pill>VIN: 1HGCM82633A004352</Badge>
          <Badge variant="neutral">#INV-2024-0042</Badge>
        </div>
      </div>
    </div>
  );
}

// ─── Avatar Examples ──────────────────────────────────────────
function AvatarExamples() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Sizes</h3>
        <div className="flex items-center gap-3">
          <Avatar size="xs" fallback="JD" />
          <Avatar size="sm" fallback="JD" />
          <Avatar size="md" fallback="JD" />
          <Avatar size="lg" fallback="JD" />
          <Avatar size="xl" fallback="JD" />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Fallback Modes</h3>
        <div className="flex items-center gap-3">
          <Avatar size="md" fallback="JD" />
          <Avatar size="md" fallback="MK" />
          <Avatar size="md" fallback="AB" />
          <Avatar size="md" />
          <Avatar size="md" src="https://i.pravatar.cc/100" alt="User avatar" ringColor="ring-primary" />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Status Indicators</h3>
        <div className="flex items-center gap-3">
          <Avatar size="md" fallback="JD" status="online" />
          <Avatar size="md" fallback="MK" status="away" />
          <Avatar size="md" fallback="AB" status="busy" />
          <Avatar size="md" fallback="SM" status="offline" />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-foreground">Avatar Groups</h3>
        <AvatarGroup size="md" max={4}>
          <Avatar fallback="JD" status="online" />
          <Avatar fallback="MK" status="online" />
          <Avatar fallback="AB" status="away" />
          <Avatar fallback="SM" status="busy" />
          <Avatar fallback="RT" />
          <Avatar fallback="KL" />
        </AvatarGroup>
      </div>
    </div>
  );
}

// ─── Skeleton Examples ──────────────────────────────────────────
function SkeletonExamples() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Text</h3>
          <Skeleton variant="text" lines={4} />
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Avatar</h3>
          <div className="flex items-center gap-3">
            <Skeleton variant="avatar" avatarSize="md" avatarShape="circle" />
            <div className="flex-1 space-y-2">
              <Skeleton variant="custom" className="h-3 w-24" />
              <Skeleton variant="custom" className="h-2 w-32" />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Card</h3>
          <Skeleton variant="card" />
        </div>
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Chart</h3>
          <Skeleton variant="chart" />
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="text-sm font-medium text-foreground mb-3">Table Rows</h3>
        <Skeleton variant="table-row" columns={5} />
        <Skeleton variant="table-row" columns={5} />
        <Skeleton variant="table-row" columns={5} />
        <Skeleton variant="table-row" columns={5} />
      </div>
    </div>
  );
}
