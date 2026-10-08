# Explicit platform read boundary

The approved superadmin needs visibility across garages. We use a separate,
GET-only projection surface with explicit platform authorization rather than
allowing tenant repositories to omit their center filter. This is a narrow read
exception to ADR0005; tenant business endpoints remain scoped to the caller.

Both an active `super_admin` role and the stored platform flag are required.
Either alone is insufficient: older admin creation and demo seed code set the
flag on tenant admins. Demo sessions never gain platform rights. Existing rows
are not automatically promoted or modified, and ordinary provisioning/account
management cannot grant platform access. Platform accounts require trusted
operator enrollment separately from this read slice. The
[operator CLI](../PLATFORM-ACCOUNTS.md) implements new-identity enrollment with
read-only preflight, explicit existing garage and fixed role/flag; it cannot
promote or overwrite ordinary accounts. It reports the existing role's tenant
staff capabilities separately from global reads. There is no HTTP enrollment.

Global projections select public business fields rather than serialize ORM
objects, excluding credentials, tokens, private notes and payment keys. Monetary
statistics preserve currencies and distinguish issued invoice totals, recorded
receipts/deposits, refunds and net receipts. Global mutations and impersonation
require a separate decision.
