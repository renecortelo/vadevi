import type {
  CreateInvitationRequest,
  CreateSpaceRequest,
  RemoveMemberRequest,
  UpdateProfileRequest,
} from "@vadevi/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo } from "react";

import type { FirebaseUser } from "../auth/firebase";
import { i18n } from "../i18n";
import { createIdempotencyKey } from "../security/idempotency";
import {
  acceptInvitation,
  ApiError,
  createInvitation,
  createSpace,
  getBootstrap,
  getSpace,
  removeMember,
  updateProfile,
} from "../services/api";
import { OnboardingPage } from "../pages/OnboardingPage";
import { SessionStatusPage } from "../pages/SessionStatusPage";
import { SessionContext, type SessionContextValue } from "./SessionContext";

export function SessionBoundary({
  children,
  signOut,
  user,
}: {
  children: ReactNode;
  signOut: () => Promise<void>;
  user: FirebaseUser;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["bootstrap", user.uid] as const;
  const bootstrapQuery = useQuery({
    queryFn: ({ signal }) => getBootstrap(user, signal),
    queryKey,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 401) && failureCount < 2,
  });
  const updateMutation = useMutation({
    mutationFn: (update: UpdateProfileRequest) => updateProfile(user, update),
    onSuccess: (response) => queryClient.setQueryData(queryKey, response),
  });
  const createSpaceMutation = useMutation({
    mutationFn: async (request: CreateSpaceRequest) => {
      const response = await createSpace(user, request, createIdempotencyKey());
      const bootstrap = await getBootstrap(user);
      return { bootstrap, response };
    },
    onSuccess: ({ bootstrap }) => queryClient.setQueryData(queryKey, bootstrap),
  });
  const createInvitationMutation = useMutation({
    mutationFn: ({ request, spaceId }: { request: CreateInvitationRequest; spaceId: string }) =>
      createInvitation(user, spaceId, request, createIdempotencyKey()),
  });
  const acceptInvitationMutation = useMutation({
    mutationFn: (token: string) => acceptInvitation(user, token),
    onSuccess: (bootstrap) => queryClient.setQueryData(queryKey, bootstrap),
  });
  const removeMemberMutation = useMutation({
    mutationFn: ({
      memberId,
      request,
      spaceId,
    }: {
      memberId: string;
      request: RemoveMemberRequest;
      spaceId: string;
    }) => removeMember(user, spaceId, memberId, request),
  });

  useEffect(() => {
    if (bootstrapQuery.error instanceof ApiError && bootstrapQuery.error.status === 401) {
      void signOut();
    }
  }, [bootstrapQuery.error, signOut]);

  useEffect(() => {
    const bootstrap = bootstrapQuery.data;
    if (bootstrap === undefined) return;
    globalThis.localStorage?.setItem("vadevi.activeSpaceId", bootstrap.data.user.activeSpaceId);
    void i18n.changeLanguage(bootstrap.data.user.preferredLocale);
  }, [bootstrapQuery.data]);

  const value = useMemo<SessionContextValue | null>(() => {
    if (bootstrapQuery.data === undefined) return null;
    return {
      acceptInvitation: (token) => acceptInvitationMutation.mutateAsync(token),
      bootstrap: bootstrapQuery.data,
      createInvitation: (spaceId, request) =>
        createInvitationMutation.mutateAsync({ request, spaceId }),
      createSpace: async (request) => (await createSpaceMutation.mutateAsync(request)).response,
      getSpace: (spaceId, signal) => getSpace(user, spaceId, signal),
      isUpdating:
        updateMutation.isPending ||
        createSpaceMutation.isPending ||
        createInvitationMutation.isPending ||
        acceptInvitationMutation.isPending ||
        removeMemberMutation.isPending,
      removeMember: (spaceId, memberId, request) =>
        removeMemberMutation.mutateAsync({ memberId, request, spaceId }),
      signOut,
      updateProfile: (update) => updateMutation.mutateAsync(update),
    };
  }, [
    acceptInvitationMutation,
    bootstrapQuery.data,
    createInvitationMutation,
    createSpaceMutation,
    removeMemberMutation,
    signOut,
    updateMutation,
    user,
  ]);

  if (bootstrapQuery.isPending) {
    return <SessionStatusPage bodyKey="auth.loadingBody" titleKey="auth.loadingTitle" />;
  }

  if (bootstrapQuery.isError || value === null) {
    return (
      <SessionStatusPage
        action={() => void bootstrapQuery.refetch()}
        actionKey="auth.retry"
        bodyKey="auth.sessionErrorBody"
        titleKey="auth.sessionErrorTitle"
      />
    );
  }

  return (
    <SessionContext.Provider value={value}>
      {value.bootstrap.data.user.onboardingComplete ? children : <OnboardingPage />}
    </SessionContext.Provider>
  );
}
