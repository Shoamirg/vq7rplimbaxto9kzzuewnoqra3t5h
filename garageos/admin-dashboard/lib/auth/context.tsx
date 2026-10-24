"use client";

// Makes the authenticated user's identity + role available to Client Components
// without re-fetching. The server layout already resolves the user (via the
// httpOnly cookie), so it seeds this provider once; children read it with
// useAuth() and gate UI through the helpers in ./permissions.
import { createContext, useContext } from "react";

import type { AuthUser } from "./permissions";
import { canManageTeam as canManageTeamFor } from "./permissions";

const AuthContext = createContext<AuthUser | null>(null);

export function AuthProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: React.ReactNode;
}) {
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthUser | null {
  return useContext(AuthContext);
}

/** Convenience: does the current user administer the tenant? */
export function useCanManageTeam(): boolean {
  return canManageTeamFor(useContext(AuthContext));
}
