import type { RuntimeConfigResponse } from "@vadevi/contracts";
import { createContext, useContext } from "react";

import type { FirebaseUser } from "./firebase";

export type AuthStatus = "error" | "loading" | "signed-in" | "signed-out";

export type AuthContextValue = {
  appEnvironment: RuntimeConfigResponse["data"]["appEnvironment"] | null;
  error: string | null;
  isEmulator: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  status: AuthStatus;
  user: FirebaseUser | null;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}
