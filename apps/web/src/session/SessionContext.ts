import type {
  BootstrapResponse,
  CreateInvitationRequest,
  CreateInvitationResponse,
  CreateSpaceRequest,
  RemoveMemberRequest,
  SpaceDetailResponse,
  UpdateProfileRequest,
} from "@vadevi/contracts";
import { createContext, useContext } from "react";

export type SessionContextValue = {
  bootstrap: BootstrapResponse;
  acceptInvitation: (token: string) => Promise<BootstrapResponse>;
  createInvitation: (
    spaceId: string,
    request: CreateInvitationRequest,
  ) => Promise<CreateInvitationResponse>;
  createSpace: (request: CreateSpaceRequest) => Promise<SpaceDetailResponse>;
  getSpace: (spaceId: string, signal?: AbortSignal) => Promise<SpaceDetailResponse>;
  isUpdating: boolean;
  /** Re-read bootstrap after a membership change so access reflects the server. */
  refresh: () => Promise<void>;
  removeMember: (
    spaceId: string,
    memberId: string,
    request: RemoveMemberRequest,
  ) => Promise<SpaceDetailResponse>;
  signOut: () => Promise<void>;
  updateProfile: (update: UpdateProfileRequest) => Promise<BootstrapResponse>;
};

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (context === null) throw new Error("useSession must be used inside SessionBoundary.");
  return context;
}
