"use client";

import React from "react";
import { Spinner } from "./spinner";

export function SpinnerDemo() {
  return (
    <div className="space-y-12 p-8 max-w-4xl">
      <Section title="Sizes" description="Four sizes from compact to prominent">
        <div className="flex items-center gap-4">
          <Spinner size="xs" />
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
        </div>
      </Section>

      <Section title="With Labels" description="Descriptive labels beside each spinner">
        <div className="flex flex-col gap-3">
          <Spinner size="xs" label="Loading..." />
          <Spinner size="sm" label="Fetching appointments..." />
          <Spinner size="md" label="Saving vehicle record..." />
          <Spinner size="lg" label="Generating report..." />
        </div>
      </Section>

      <Section title="Centered" description="Centered layout for full-section loading states">
        <div className="border border-dashed border-border rounded-lg">
          <Spinner size="md" centered label="Loading dashboard..." />
        </div>
        <div className="border border-dashed border-border rounded-lg">
          <Spinner size="lg" centered label="Syncing vehicle data..." />
        </div>
      </Section>

      <Section title="Inline" description="Inline spinners work inside text and buttons">
        <p className="text-sm text-foreground">
          Searching customer records <Spinner size="xs" inline />
        </p>
        <p className="text-sm text-foreground">
          Processing payment <Spinner size="sm" inline />
        </p>
      </Section>

      <Section title="Real GarageOS Usage" description="How spinners appear throughout the app">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
            <Spinner size="sm" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">Loading vehicle health report</span>
              <span className="text-xs text-muted-foreground">Fetching maintenance records and diagnostics</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
            <Spinner size="sm" />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">Syncing with Telegram</span>
              <span className="text-xs text-muted-foreground">Updating customer notifications</span>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
            <Spinner size="xs" label="Searching inventory..." />
            <span className="text-xs text-muted-foreground ml-auto">2,341 parts indexed</span>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-lg border border-border p-4 bg-background">
        {children}
      </div>
    </div>
  );
}
