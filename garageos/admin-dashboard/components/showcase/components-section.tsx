"use client";

import { Plus, Trash2, ArrowRight, Mail } from "lucide-react";
import {
  Button, Badge, Avatar, Spinner,
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Input,
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
  Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription,
  useToast,
} from "@garageos/design-system";
import { Section, Subsection, Specimen } from "./kit";

const BUTTON_VARIANTS = ["primary", "secondary", "outline", "ghost", "danger", "success", "link"] as const;
const BADGE_VARIANTS = ["default", "primary", "success", "warning", "danger", "info", "neutral"] as const;

export function ComponentsSection() {
  const { toast } = useToast();

  return (
    <Section id="components" kicker="Components" title="Core UI primitives">
      {/* Buttons */}
      <Subsection title="Button — variants">
        {BUTTON_VARIANTS.map((v) => (
          <Button key={v} variant={v}>{v}</Button>
        ))}
      </Subsection>
      <Subsection title="Button — sizes, icons & states">
        <Button size="xs">xs</Button>
        <Button size="sm">sm</Button>
        <Button size="md">md</Button>
        <Button size="lg">lg</Button>
        <Button leftIcon={<Plus className="size-4" />}>New</Button>
        <Button variant="outline" rightIcon={<ArrowRight className="size-4" />}>Next</Button>
        <Button loading>Saving</Button>
        <Button disabled>Disabled</Button>
      </Subsection>

      {/* Badges */}
      <Subsection title="Badge">
        {BADGE_VARIANTS.map((v) => (
          <Badge key={v} variant={v}>{v}</Badge>
        ))}
      </Subsection>

      {/* Avatars & spinner */}
      <Subsection title="Avatar & Spinner">
        <Avatar size="sm" fallback="AB" />
        <Avatar size="md" fallback="CM" />
        <Avatar size="lg" fallback="DV" />
        <div className="pl-4"><Spinner /></div>
      </Subsection>

      {/* Inputs */}
      <Subsection title="Input" className="flex-col items-stretch gap-3 max-w-sm">
        <Input label="Email" placeholder="you@garage.com" leftIcon={<Mail className="size-4" />} />
        <Input label="Search" placeholder="Search customers…" />
        <Input label="Disabled" placeholder="Unavailable" disabled />
      </Subsection>

      {/* Cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Card</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Default card</CardTitle>
              <CardDescription>Bordered surface for grouped content.</CardDescription>
            </CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">Body content lives here.</p></CardContent>
          </Card>
          <Card variant="elevated">
            <CardHeader>
              <CardTitle>Elevated</CardTitle>
              <CardDescription>Raised with a soft shadow.</CardDescription>
            </CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">Use for primary widgets.</p></CardContent>
            <CardFooter><Button size="sm" variant="outline">Action</Button></CardFooter>
          </Card>
          <Card variant="elevated" className="relative overflow-hidden">
            <div className="absolute inset-0 bg-linear-to-br from-primary/10 to-transparent" />
            <CardHeader><CardTitle>With accent</CardTitle><CardDescription>Gradient wash for emphasis.</CardDescription></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground">Fleet-health style.</p></CardContent>
          </Card>
        </div>
      </div>

      {/* Overlays & feedback */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Overlays & feedback</h3>
        <div className="flex flex-wrap gap-3">
          {/* Dialog */}
          <Dialog>
            <DialogTrigger asChild><Button variant="outline">Open dialog</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Cancel appointment?</DialogTitle>
                <DialogDescription>This frees the slot and notifies the customer. This cannot be undone.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild><Button variant="ghost">Keep it</Button></DialogClose>
                <DialogClose asChild><Button variant="danger" leftIcon={<Trash2 className="size-4" />}>Cancel appointment</Button></DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Sheet / Drawer */}
          <Sheet>
            <SheetTrigger asChild><Button variant="outline">Open drawer</Button></SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Appointment details</SheetTitle>
                <SheetDescription>The inspector drawer used across the Operations Board.</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                <p>Customer, mechanic, vehicle health and lifecycle actions live here.</p>
              </div>
            </SheetContent>
          </Sheet>

          {/* Toasts */}
          <Button variant="success" onClick={() => toast({ variant: "success", title: "Appointment completed", description: "Health recalculated." })}>Success toast</Button>
          <Button variant="danger" onClick={() => toast({ variant: "danger", title: "Couldn't save", description: "Reverted the change." })}>Error toast</Button>
          <Button variant="outline" onClick={() => toast({ variant: "info", title: "Heads up", description: "Slot is nearly full." })}>Info toast</Button>
        </div>
      </div>
    </Section>
  );
}
