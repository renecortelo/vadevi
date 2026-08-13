import type { BootstrapResponse, UpdateProfileRequest } from "@vadevi/contracts";
import { createContext, useContext } from "react";

export type SessionContextValue = {
  bootstrap: BootstrapResponse;
  isUpdating: boolean;
  signOut: () => Promise<void>;
  updateProfile: (update: UpdateProfileRequest) => Promise<BootstrapResponse>;
};

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (context === null) throw new Error("useSession must be used inside SessionBoundary.");
  return context;
}
