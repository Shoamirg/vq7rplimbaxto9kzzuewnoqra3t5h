"use client";

import React from "react";
import { Search, Mail, User, Lock, AlertCircle } from "lucide-react";
import { Input } from "./input";

export function InputDemo() {
  const [value, setValue] = React.useState("");

  return (
    <div className="space-y-12 p-8 max-w-4xl">
      <Section title="Sizes" description="Three sizes for different contexts">
        <div className="flex flex-col gap-4 max-w-sm">
          <Input size="sm" placeholder="Small input" />
          <Input size="md" placeholder="Medium input (default)" />
          <Input size="lg" placeholder="Large input" />
        </div>
      </Section>

      <Section title="With Labels" description="Descriptive labels with optional required indicator">
        <div className="flex flex-col gap-4 max-w-sm">
          <Input label="Customer Name" placeholder="Enter full name" required />
          <Input label="Email Address" type="email" placeholder="customer@example.com" />
          <Input label="Phone Number" placeholder="+1 (555) 000-0000" />
        </div>
      </Section>

      <Section title="Icons" description="Prefix and suffix icons for context">
        <div className="flex flex-col gap-4 max-w-sm">
          <Input label="Search" leftIcon={<Search />} placeholder="Search customers, VIN, appointments..." />
          <Input label="Email" leftIcon={<Mail />} type="email" placeholder="customer@example.com" />
          <Input label="Username" leftIcon={<User />} placeholder="Enter username" />
          <Input label="Password" leftIcon={<Lock />} type="password" placeholder="Enter password" />
        </div>
      </Section>

      <Section title="Helper & Error Text" description="Guidance and validation feedback">
        <div className="flex flex-col gap-4 max-w-sm">
          <Input
            label="License Plate"
            helperText="Enter plate number without spaces"
            placeholder="ABC-1234"
          />
          <Input
            label="VIN Number"
            error="Invalid VIN: must be exactly 17 characters"
            defaultValue="1HGCM82633A"
            placeholder="17-character VIN"
          />
          <Input
            label="Mileage"
            helperText="Current odometer reading"
            success
            defaultValue="45,230"
            placeholder="Enter mileage"
          />
        </div>
      </Section>

      <Section title="Loading & Clearable" description="Async operations and quick clearing">
        <div className="flex flex-col gap-4 max-w-sm">
          <Input
            label="Search Inventory"
            loading
            placeholder="Searching..."
          />
          <Input
            label="Find Customer"
            clearable
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Type to search..."
          />
          <Input
            label="Email Address"
            type="email"
            clearable
            placeholder="Enter email..."
          />
        </div>
      </Section>

      <Section title="Password" description="Password input with visibility toggle">
        <div className="flex flex-col gap-4 max-w-sm">
          <Input
            label="Password"
            type="password"
            placeholder="Enter password"
            helperText="At least 8 characters"
          />
          <Input
            label="Confirm Password"
            type="password"
            placeholder="Re-enter password"
            error="Passwords do not match"
          />
        </div>
      </Section>

      <Section title="Disabled & Read Only" description="Non-interactive states">
        <div className="flex flex-col gap-4 max-w-sm">
          <Input
            label="Service Center"
            disabled
            value="GarageOS Downtown"
          />
          <Input
            label="Last Updated"
            readOnly
            value="June 29, 2026 09:42 AM"
          />
          <Input
            label="Vehicle Status"
            disabled
            value="In Service"
            leftIcon={<AlertCircle />}
          />
        </div>
      </Section>

      <Section title="With Character Counter" description="Input length tracking">
        <div className="flex flex-col gap-4 max-w-sm">
          <Input
            label="Service Notes"
            placeholder="Describe the issue..."
            counter="0/500"
            helperText="Add details about the vehicle condition"
          />
          <Input
            label="Customer Feedback"
            placeholder="Enter feedback..."
            counter="42/200"
          />
        </div>
      </Section>

      <Section title="GarageOS Real Forms" description="How inputs appear in actual workflows">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* New Customer Form */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <h3 className="text-sm font-semibold text-foreground">New Customer</h3>
            <Input label="Full Name" placeholder="John Smith" required />
            <Input label="Email" type="email" placeholder="john@example.com" leftIcon={<Mail />} />
            <Input label="Phone" placeholder="+1 (555) 123-4567" />
            <Input label="Vehicle VIN" placeholder="17-character VIN" counter="0/17" />
          </div>

          {/* Login Form */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <h3 className="text-sm font-semibold text-foreground">Staff Login</h3>
            <Input label="Email" type="email" placeholder="staff@garageos.com" leftIcon={<Mail />} />
            <Input
              label="Password"
              type="password"
              placeholder="Enter password"
              leftIcon={<Lock />}
              helperText="Forgot password? Contact admin"
            />
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
