import { describe, expect, it } from "vitest";

import { FirebaseTokenVerificationError, verifyFirebaseIdToken } from "../src/auth/firebase-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

const localBindings = {
  APP_ENV: "local",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_PROJECT_ID: "demo-vadevi",
} as const;

describe("Firebase token verification", () => {
  it("accepts emulator tokens only under explicit local demo configuration", async () => {
    const principal = await verifyFirebaseIdToken(emulatorIdToken(), localBindings);

    expect(principal).toMatchObject({
      displayName: "Phase One",
      email: "phase1@example.test",
      firebaseUid: "firebase-emulator-user-phase-1",
    });
  });

  it("rejects an unsigned token outside local emulator mode", async () => {
    const token = emulatorIdToken({
      aud: "preview-vadevi",
      iss: "https://securetoken.google.com/preview-vadevi",
    });

    await expect(
      verifyFirebaseIdToken(token, {
        APP_ENV: "preview",
        FIREBASE_PROJECT_ID: "preview-vadevi",
      }),
    ).rejects.toBeInstanceOf(FirebaseTokenVerificationError);
  });

  it("rejects expired emulator tokens", async () => {
    const now = 2_000_000_000;
    const token = emulatorIdToken({ exp: now - 61 }, now);

    await expect(verifyFirebaseIdToken(token, localBindings, now)).rejects.toBeInstanceOf(
      FirebaseTokenVerificationError,
    );
  });
});
