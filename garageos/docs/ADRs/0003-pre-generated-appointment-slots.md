# ADR 0003: Pre-Generated Appointment Slots

## Status
Accepted

## Context
Appointment booking is a core feature. We need to prevent double-booking, support temporary reservations, and provide a smooth booking experience.

## Decision
Use a pre-generated AppointmentSlot table rather than computing available slots on-the-fly.

### Benefits
- Simple conflict detection (just check slot status)
- Temporary reservation support (reserved_until column)
- Easy calendar visualization
- Straightforward rescheduling
- Supports different service durations and mechanic availability

### Implementation
- Slots are generated daily/weekly by a scheduled job
- States: available → reserved → booked → blocked
- Reserved slots expire after 30 minutes
- Booking flow: select slot → reserve → confirm → booked

## Consequences
- Requires a scheduled job to generate slots
- Storage overhead for slot records
- Makes conflict detection O(1) instead of O(n)
