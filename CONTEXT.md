# GarageOS domain

GarageOS tracks customers, vehicles, and the work an auto service center performs for them.

## Language

**Service center (avtoservis)**:
A garage or workshop that performs service work on customers' vehicles.

**Customer (mijoz)**:
A vehicle owner who receives service work from a service center.
_Avoid_: Using the generic name “user” when the customer role is meant.

**Admin (avtoservis egasi)**:
The owner responsible for a service center and its staff, customers, and service work.

**Superadmin (tizim administratori)**:
A platform administrator with visibility across all service centers, customers, staff, admins, and statistics.

**Service work (servis ishi)**:
Work performed on a customer's vehicle, including diagnosis, routine maintenance, and repair.
_Avoid_: Using “repair” or “ta’mir” as the generic name for all service work.

**Appointment (navbat)**:
An agreed visit time for a customer and vehicle at a service center.

**Mechanic (usta)**:
A service-center worker assigned by its admin to perform service work on a customer's vehicle.
_Avoid_: Using the generic name “user” when the mechanic role is meant.

**Invoice (hisob-faktura)**:
A request for payment that lists the service work and amounts charged to a customer.
_Avoid_: Using “payment” or “to‘lov” for the invoice itself.

## Relationships

An appointment connects one customer, one vehicle, and a service center. A mechanic can be assigned before work starts. Completing service work creates a history record for that vehicle, linked to the appointment. A completed appointment can have one final invoice listing the amounts charged for its work.

A customer receives service work; a mechanic performs the work assigned by the admin. An admin is responsible for their own service center. A superadmin has visibility across service centers, while the other roles remain limited to their own service center, records, or assigned work.
