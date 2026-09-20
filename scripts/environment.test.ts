import { describe, expect, it } from "vitest";

import { validateEnvironment, wranglerVars } from "./environment";

/**
 * The settings a deployment ships with, checked before the deploy. Each case
 * here is a way a private door was, or could have been, misconfigured into
 * an open one — or into no door at all — by a file the deploy used to ship
 * without reading.
 */
const preview = {
  APP_ENV: "preview",
  FIREBASE_AUTH_DOMAIN: "demo-vadevi.firebaseapp.com",
  FIREBASE_PROJECT_ID: "demo-vadevi",
  FIREBASE_WEB_API_KEY: "web-api-key",
};

function check(vars: Record<string, unknown>) {
  return validateEnvironment(wranglerVars({ vars: { ...preview, ...vars } }));
}

describe("the deployment's access settings", () => {
  it("accepts an open deployment, and a closed one with a keeper", () => {
    expect(check({}).ok).toBe(true);
    expect(check({ ACCESS_MODE: "allowlist", ADMIN_EMAILS: "keeper@example.test" }).ok).toBe(true);
  });

  it("refuses a misspelled door — the one the Worker used to read as open", () => {
    const result = check({ ACCESS_MODE: "allowlst", ADMIN_EMAILS: "keeper@example.test" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("ACCESS_MODE");
  });

  it("refuses a closed door with nobody to keep it", () => {
    expect(check({ ACCESS_MODE: "allowlist" }).ok).toBe(false);
    expect(check({ ACCESS_MODE: "allowlist", ADMIN_EMAILS: "not an address" }).ok).toBe(false);
  });

  it("refuses half a second door, and a malformed one", () => {
    const team = "muddy-team";
    const aud = "a".repeat(64);
    expect(check({ ACCESS_ADMIN_AUD: aud, ACCESS_TEAM_DOMAIN: team }).ok).toBe(true);
    expect(check({ ACCESS_TEAM_DOMAIN: team }).ok).toBe(false);
    expect(check({ ACCESS_ADMIN_AUD: aud }).ok).toBe(false);
    expect(check({ ACCESS_ADMIN_AUD: "short", ACCESS_TEAM_DOMAIN: team }).ok).toBe(false);
    expect(check({ ACCESS_ADMIN_AUD: aud, ACCESS_TEAM_DOMAIN: "Not A Team" }).ok).toBe(false);
  });

  it("needs a vars block to read at all", () => {
    expect(() => wranglerVars({})).toThrow(/vars/);
  });
});
