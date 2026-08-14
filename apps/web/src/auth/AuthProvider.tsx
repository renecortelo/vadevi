import type { RuntimeConfigResponse } from "@vadevi/contracts";
import {
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type Auth,
} from "firebase/auth";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { webEnvironment } from "../config/env";
import { getRuntimeConfig } from "../services/api";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./AuthContext";
import { createFirebaseAuth, type FirebaseUser } from "./firebase";
import { clearOfflineDataForUser } from "../offline/database";

function localRuntimeConfig(): RuntimeConfigResponse {
  return {
    data: {
      appEnvironment: "local",
      features: {
        assistant: false,
        externalResearch: false,
        priceLookup: false,
        voiceInput: false,
      },
      firebase: {
        apiKey: webEnvironment.firebaseApiKey,
        authDomain: webEnvironment.firebaseAuthDomain,
        emulatorHost: webEnvironment.firebaseAuthEmulatorHost,
        projectId: webEnvironment.firebaseProjectId,
      },
    },
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const authRef = useRef<Auth | null>(null);
  const previousUserIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfigResponse | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    async function initialize() {
      try {
        let config: RuntimeConfigResponse;
        try {
          config = await getRuntimeConfig();
        } catch (runtimeError) {
          if (!webEnvironment.firebaseUseEmulator) {
            throw runtimeError;
          }
          config = localRuntimeConfig();
        }

        const auth = createFirebaseAuth(config.data.firebase);
        await setPersistence(auth, browserLocalPersistence);
        if (!active) return;

        authRef.current = auth;
        setRuntimeConfig(config);
        unsubscribe = onAuthStateChanged(
          auth,
          (nextUser) => {
            if (!active) return;
            const previousUserId = previousUserIdRef.current;
            if (previousUserId !== null && previousUserId !== nextUser?.uid) {
              void clearOfflineDataForUser(previousUserId);
            }
            previousUserIdRef.current = nextUser?.uid ?? null;
            setUser(nextUser);
            setError(null);
            setStatus(nextUser === null ? "signed-out" : "signed-in");
          },
          () => {
            if (!active) return;
            setError("Authentication state could not be restored.");
            setStatus("error");
          },
        );

        await getRedirectResult(auth);
      } catch {
        if (!active) return;
        setError("Authentication could not be initialized.");
        setStatus("error");
      }
    }

    void initialize();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      appEnvironment: runtimeConfig?.data.appEnvironment ?? null,
      error,
      isEmulator: runtimeConfig?.data.firebase.emulatorHost !== undefined,
      signIn: async () => {
        const auth = authRef.current;
        if (auth === null) throw new Error("Authentication is not ready.");
        const provider = new GoogleAuthProvider();

        // Redirect sign-in needs the app and the Firebase auth domain to share
        // an origin. When the app is hosted elsewhere — a Workers subdomain, for
        // instance — browsers that partition third-party storage drop the
        // redirect state and sign-in fails. A popup carries its own state, so it
        // is tried first and redirect remains the fallback for environments that
        // block popups, such as an installed PWA.
        try {
          await signInWithPopup(auth, provider);
        } catch (popupError) {
          const code = (popupError as { code?: string } | null)?.code ?? "";
          const popupUnavailable =
            code === "auth/popup-blocked" ||
            code === "auth/popup-closed-by-user" ||
            code === "auth/cancelled-popup-request" ||
            code === "auth/operation-not-supported-in-this-environment";
          if (!popupUnavailable) throw popupError;
          await signInWithRedirect(auth, provider);
        }
      },
      signOut: async () => {
        const auth = authRef.current;
        if (user !== null) await clearOfflineDataForUser(user.uid);
        if (auth !== null) await firebaseSignOut(auth);
      },
      status,
      user,
    }),
    [error, runtimeConfig, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
