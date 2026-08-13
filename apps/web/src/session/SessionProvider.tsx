import type { UpdateProfileRequest } from "@vadevi/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo } from "react";

import type { FirebaseUser } from "../auth/firebase";
import { i18n } from "../i18n";
import { ApiError, getBootstrap, updateProfile } from "../services/api";
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
      bootstrap: bootstrapQuery.data,
      isUpdating: updateMutation.isPending,
      signOut,
      updateProfile: (update) => updateMutation.mutateAsync(update),
    };
  }, [bootstrapQuery.data, signOut, updateMutation]);

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
