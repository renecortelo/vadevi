import type { RuntimeConfigResponse } from "@vadevi/contracts";
import {
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type Auth,
} from "firebase/auth";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { webEnvironment } from "../config/env";
import { getRuntimeConfig } from "../services/api";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./AuthContext";
import { createFirebaseAuth, type FirebaseUser } from "./firebase";

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
        await signInWithRedirect(auth, new GoogleAuthProvider());
      },
      signOut: async () => {
        const auth = authRef.current;
        if (auth !== null) await firebaseSignOut(auth);
      },
      status,
      user,
    }),
    [error, runtimeConfig, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
