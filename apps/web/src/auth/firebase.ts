import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth, type User } from "firebase/auth";

import type { RuntimeConfigResponse } from "@vadevi/contracts";

type FirebaseRuntimeConfig = RuntimeConfigResponse["data"]["firebase"];

let connectedEmulatorAuth: Auth | undefined;

export function createFirebaseAuth(config: FirebaseRuntimeConfig): Auth {
  const app =
    getApps().length === 0
      ? initializeApp({
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
        })
      : getApp();
  const auth = getAuth(app);

  if (config.emulatorHost !== undefined && connectedEmulatorAuth !== auth) {
    const emulatorUrl = config.emulatorHost.startsWith("http")
      ? config.emulatorHost
      : `http://${config.emulatorHost}`;
    connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true });
    connectedEmulatorAuth = auth;
  }

  return auth;
}

export type FirebaseUser = User;
