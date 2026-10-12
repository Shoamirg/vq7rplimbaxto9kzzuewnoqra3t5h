/** Navigation affordances only; the backend remains the authorization authority. */
const OFFICE_ROLES = new Set(["admin", "manager", "receptionist"]);

export function isOfficeRole(role: string | null | undefined): boolean {
  return OFFICE_ROLES.has(role ?? "");
}
