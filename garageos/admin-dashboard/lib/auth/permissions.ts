// Client-side mirror of the backend access policy (app/core/roles.py). This is
// UX only — it decides what to show/enable. The API enforces the same rules
// server-side, so a hidden button is defence-in-depth, never the sole guard.

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  MANAGER: "manager",
  RECEPTIONIST: "receptionist",
  MECHANIC: "mechanic",
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

// Assignable through the team UI (super_admin is platform-level, not offered).
export const ASSIGNABLE_ROLES: RoleName[] = [
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.RECEPTIONIST,
  ROLES.MECHANIC,
];

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string | null;
  isSuperAdmin: boolean;
}

/** super_admin always passes; otherwise the role must be in `allowed`. */
export function hasRole(user: AuthUser | null | undefined, allowed: readonly string[]): boolean {
  if (!user) return false;
  if (user.isSuperAdmin || user.role === ROLES.SUPER_ADMIN) return true;
  return user.role != null && allowed.includes(user.role);
}

/** May administer the tenant: manage staff, assign roles, edit settings. */
export function canManageTeam(user: AuthUser | null | undefined): boolean {
  return hasRole(user, [ROLES.ADMIN]);
}
