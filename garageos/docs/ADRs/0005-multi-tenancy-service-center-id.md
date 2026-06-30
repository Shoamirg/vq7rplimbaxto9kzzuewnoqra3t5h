# ADR 0005: Multi-Tenancy via service_center_id

## Status
Accepted

## Context
GarageOS will serve multiple independent garages (service centers). Each garage's data must be isolated from others.

## Decision
Use a shared-database, shared-schema approach with `service_center_id` on every business table.

### Implementation
- All business tables include a `service_center_id` UUID foreign key
- A `ServiceCenterMixin` provides this column automatically
- All repository queries filter by `service_center_id`
- JWT tokens include the user's `service_center_id`

### Alternatives Considered
- **Separate databases per tenant**: Operational complexity, harder to manage
- **Separate schemas per tenant**: Migration complexity
- **Row-level security**: PostgreSQL RLS is powerful but adds complexity

## Consequences
- Simple to implement and reason about
- All queries must include `service_center_id` (can't forget)
- Database indexes on `service_center_id` are critical
- Data export per tenant requires filtering
- Good for 10-1000 tenants; beyond that, consider schema-per-tenant
