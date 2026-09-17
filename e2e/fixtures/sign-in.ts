import { expect, type Page } from "@playwright/test";

/**
 * Establishes an authenticated session against the Firebase Auth Emulator.
 *
 * The obvious approach — driving the provider popup — does not work here. The
 * Auth Emulator's popup handler fails with "Auth Emulator Internal Error: No
 * matching frame" because it cannot locate the initiating frame. That is an
 * emulator limitation rather than an application defect: the same popup flow
 * works against real Firebase, which is what the preview deployment exercises.
 *
 * So the session is seeded instead. The emulator issues a real (unsigned,
 * local-only) token over its REST API, and that token is written into the exact
 * localStorage key the Firebase SDK reads under `browserLocalPersistence`. The
 * application then boots as a normally signed-in user, and everything after
 * this point — bootstrap, authorization, rendering — is the real code path.
 *
 * The emulator uses the synthetic `demo-vadevi` project, so no real account is
 * ever involved.
 */

const emulatorHost = "http://127.0.0.1:9099";
/** Matches the placeholder in wrangler.example.jsonc. */
const apiKey = "local-emulator-placeholder";

type EmulatorUser = {
  email: string;
  idToken: string;
  localId: string;
  refreshToken: string;
};

async function createEmulatorUser(): Promise<EmulatorUser> {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 100_000)}@example.test`;
  const response = await fetch(
    `${emulatorHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      body: JSON.stringify({
        displayName: "E2E Taster",
        email,
        password: `pw-${Math.random().toString(36).slice(2)}`,
        returnSecureToken: true,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) {
    throw new Error(`Auth Emulator sign-up failed with HTTP ${response.status}.`);
  }
  const body = (await response.json()) as {
    idToken: string;
    localId: string;
    refreshToken: string;
  };
  return { email, idToken: body.idToken, localId: body.localId, refreshToken: body.refreshToken };
}

export async function signIn(page: Page): Promise<string> {
  const user = await createEmulatorUser();

  // The SDK reads this key on boot under browserLocalPersistence.
  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      globalThis.localStorage.setItem(key, value);
    },
    {
      key: `firebase:authUser:${apiKey}:[DEFAULT]`,
      value: JSON.stringify({
        apiKey,
        appName: "[DEFAULT]",
        createdAt: String(Date.now()),
        displayName: "E2E Taster",
        email: user.email,
        emailVerified: false,
        isAnonymous: false,
        lastLoginAt: String(Date.now()),
        providerData: [
          {
            displayName: "E2E Taster",
            email: user.email,
            phoneNumber: null,
            photoURL: null,
            providerId: "password",
            uid: user.email,
          },
        ],
        stsTokenManager: {
          accessToken: user.idToken,
          // One hour ahead, so the SDK does not immediately try to refresh.
          expirationTime: Date.now() + 60 * 60 * 1000,
          refreshToken: user.refreshToken,
        },
        uid: user.localId,
      }),
    },
  );

  await page.goto("/");
  return user.email;
}

/**
 * Completes first-run onboarding so later assertions land on the shell rather
 * than the profile form.
 */
export async function completeOnboarding(page: Page): Promise<void> {
  const nameField = page.locator("#display-name");
  const shell = page.locator("nav[aria-label='Primary']");

  // `isVisible()` resolves immediately rather than auto-waiting, so it must not
  // be the thing that decides whether onboarding is showing — right after a
  // navigation React has not rendered yet and it would always answer false.
  // Race the two possible first screens instead.
  await expect(nameField.or(shell).first()).toBeVisible({ timeout: 30_000 });

  if (await nameField.isVisible()) {
    await nameField.fill("E2E Taster");
    await page.getByRole("button", { name: /enter va de vi/i }).click();
  }

  await expect(shell).toBeVisible({ timeout: 30_000 });
}
