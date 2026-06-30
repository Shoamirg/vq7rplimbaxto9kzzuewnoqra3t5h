"use client";

import React from "react";
import {
  Plus, UserPlus, Car, Calendar, Wrench, CheckCircle2,
  FileText, Send, Download, ArrowRight, X, Bell, Search,
} from "lucide-react";
import { Button } from "./button";

export function ButtonDemo() {
  return (
    <div className="space-y-12 p-8 max-w-4xl">
      <Section title="Variants" description="Seven semantic variants for different contexts">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="success">Success</Button>
        <Button variant="link">Link</Button>
      </Section>

      <Section title="Sizes" description="Five sizes from compact table actions to hero buttons">
        <Button size="xs">Extra Small</Button>
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
        <Button size="icon" aria-label="Notifications"><Bell /></Button>
      </Section>

      <Section title="Icons" description="Icons at both positions">
        <Button leftIcon={<Plus />}>Add Customer</Button>
        <Button rightIcon={<ArrowRight />}>Continue</Button>
        <Button leftIcon={<Search />} variant="outline">Search</Button>
        <Button rightIcon={<Download />} variant="secondary">Export</Button>
      </Section>

      <Section title="Loading States" description="Async operations with fixed-width spinners">
        <Button loading variant="primary">Saving...</Button>
        <Button loading variant="success">Completing...</Button>
        <Button loading variant="danger">Deleting...</Button>
        <Button loading variant="outline">Loading...</Button>
        <Button loading size="icon" aria-label="Loading"><Bell /></Button>
      </Section>

      <Section title="Disabled States" description="Disabled interaction with reduced opacity">
        <Button disabled variant="primary">Save Changes</Button>
        <Button disabled variant="secondary">Cancel</Button>
        <Button disabled variant="outline">Discard</Button>
        <Button disabled variant="ghost">More</Button>
      </Section>

      <Section title="Full Width" description="Stretches to container width for forms and CTAs">
        <div className="w-full max-w-sm">
          <Button fullWidth leftIcon={<Plus />}>Book Appointment</Button>
        </div>
        <div className="w-full max-w-sm">
          <Button fullWidth variant="outline" rightIcon={<ArrowRight />}>Continue to Payment</Button>
        </div>
      </Section>

      <Section title="GarageOS Vehicle Actions" description="Real actions from the Vehicle Health Dashboard">
        <Button variant="primary" leftIcon={<Car />}>Register Vehicle</Button>
        <Button variant="success" leftIcon={<CheckCircle2 />}>Complete Service</Button>
        <Button variant="outline" leftIcon={<Wrench />}>Start Diagnosis</Button>
        <Button variant="danger" leftIcon={<X />}>Remove Vehicle</Button>
      </Section>

      <Section title="GarageOS Appointment Actions" description="Real actions from the Calendar">
        <Button variant="primary" leftIcon={<Calendar />}>Book Appointment</Button>
        <Button variant="success" leftIcon={<CheckCircle2 />}>Confirm Booking</Button>
        <Button variant="outline" leftIcon={<FileText />}>Send Reminder</Button>
        <Button variant="ghost" leftIcon={<X />}>Cancel</Button>
      </Section>

      <Section title="GarageOS Customer Actions" description="Real actions from Customer CRM">
        <Button variant="primary" leftIcon={<UserPlus />}>Add Customer</Button>
        <Button variant="outline" leftIcon={<Send />}>Send Message</Button>
        <Button variant="secondary" leftIcon={<FileText />}>View History</Button>
        <Button variant="ghost" leftIcon={<Download />}>Export</Button>
      </Section>

      <Section title="Form Footer" description="Standard form action pattern">
        <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30">
          <Button variant="ghost">Cancel</Button>
          <Button variant="outline">Save Draft</Button>
          <Button leftIcon={<Plus />}>Create Customer</Button>
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
      <div className="flex flex-wrap items-center gap-3">
        {children}
      </div>
    </div>
  );
}
