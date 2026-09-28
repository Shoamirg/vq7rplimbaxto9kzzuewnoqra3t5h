# GarageOS domain

GarageOS tracks customers, vehicles, and the work an auto service center performs for them.

## Language

**Service work (servis ishi)**:
Work performed on a customer's vehicle, including diagnosis, routine maintenance, and repair.
_Avoid_: Using “repair” or “ta’mir” as the generic name for all service work.

**Appointment (navbat)**:
An agreed visit time for a customer and vehicle at a service center.

**Mechanic (usta)**:
A service-center worker assigned to perform service work on a vehicle.

**Invoice (hisob-faktura)**:
A request for payment that lists the service work and amounts charged to a customer.
_Avoid_: Using “payment” or “to‘lov” for the invoice itself.

## Local demo workflow

A staff member creates and confirms an appointment, assigns a mechanic, starts the work, and completes it. Starting requires both confirmation and an assigned mechanic. At completion, the staff member records the work performed and optional details; this creates one service-history record for the vehicle. A completed appointment can have one linked final invoice. Reopening its invoice action opens that same invoice. Fresh demo invoices use UZS, and the customer-facing invoice page can be viewed without signing in.
