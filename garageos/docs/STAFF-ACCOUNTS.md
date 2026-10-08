# Owner-managed employee accounts

The workshop owner (`admin`) manages their own garage's employee accounts at
**Settings → Employee accounts**. The existing operator provisioning tool still
creates the garage and owner; this page does not create owners or superadmins.

## Daily workflow

1. Add an employee with name, unique login email, initial password and employee
   role: mechanic, manager or reception staff. The password needs at least 10
   characters and at most 72 UTF-8 bytes; share it privately with that employee.
2. Search the name/email to find an account. Equal names remain distinct by
   email and UUID; lists are paginated on the server.
3. Edit the employee's name, optional phone or employee role. Login email is
   fixed; this slice does not reset existing passwords or move garages.
4. Suspend an account when access should stop. Existing access/refresh tokens
   fail the server's active-user checks. Reactivation preserves the same account,
   history and password; do not delete history to remove access.

An active mechanic appears in the real-account appointment picker and signs in
to Flutter's assigned-work panel. Changing a mechanic to another employee role
changes their capabilities according to the existing role policy; it does not
grant the owner access to any other garage. Existing assigned job UUIDs/history
are retained when employees are suspended or their names/roles change.

## Access contract

- `/api/v1/staff`: GET with literal `q`, bounded `page` and `page_size`; POST to
  create an employee. PATCH `/api/v1/staff/{uuid}` changes allowed fields.
- All operations require an active owner with `staff.write`; public demo and
  manager/reception/mechanic/platform roles cannot use this owner-management API.
- Every target and list is constrained to the authenticated garage. Other
  garages' IDs return 404. Email conflicts return a generic 409 with no identity
  details; emails remain unique across the existing staff login namespace.
- Owner/admin, platform-flag and unknown-role accounts are protected. The owner
  cannot suspend or change their own account or grant admin/superadmin authority.
- Password hashes and passwords are never response fields. Successful mutations
  append an audit record in the same transaction, containing actor/target IDs
  and changed field names, without secret values.

The implemented customer password portal and global superadmin read panel have
separate access contracts. See the [Uzbek usage guide](USER-GUIDE.md) for those
flows. Production hosting, owner signing, physical devices and client pilot
acceptance remain separate gates in the [operator handoff](HANDOFF.md).
