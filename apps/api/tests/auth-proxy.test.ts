import { RuntimeConfigResponseSchema } from "@vadevi/contracts";
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { firebaseAuthUpstream } from "../src/app";

/**
 * The Firebase auth handler proxy forwards a reserved path to a fixed,
 * deployment-configured host. These tests pin the boundary: it must be off by
 * default, must never accept a host from anywhere but configuration, and must
 * never become a general-purpose proxy.
 */
describe("Firebase auth handler upstream selection", () => {
  it("is disabled unless a deployment opts in", () => {
    expect(
      firebaseAuthUpstream({
        FIREBASE_AUTH_DOMAIN: "demo-vadevi.firebaseapp.com",
      }),
    ).toBeNull();
    expect(
      firebaseAuthUpstream({
        FIREBASE_AUTH_DOMAIN: "demo-vadevi.firebaseapp.com",
        FIREBASE_AUTH_PROXY: "false",
      }),
    ).toBeNull();
  });

  it("accepts only Firebase-issued auth domains", () => {
    for (const host of ["demo-vadevi.firebaseapp.com", "demo-vadevi.web.app"]) {
      expect(
        firebaseAuthUpstream({ FIREBASE_AUTH_DOMAIN: host, FIREBASE_AUTH_PROXY: "true" }),
      ).toBe(host);
    }
  });

  it("refuses any host that is not a Firebase auth domain", () => {
    for (const host of [
      "evil.example.com",
      "demo-vadevi.firebaseapp.com.evil.example",
      "localhost",
      "127.0.0.1",
      "169.254.169.254",
      "10.0.0.1",
    ]) {
      expect(
        firebaseAuthUpstream({ FIREBASE_AUTH_DOMAIN: host, FIREBASE_AUTH_PROXY: "true" }),
      ).toBeNull();
    }
  });

  it("refuses a configured value carrying a scheme, credentials, port, or path", () => {
    for (const host of [
      "https://demo-vadevi.firebaseapp.com",
      "user:pass@demo-vadevi.firebaseapp.com",
      "demo-vadevi.firebaseapp.com:8080",
      "demo-vadevi.firebaseapp.com/../evil",
      "demo-vadevi.firebaseapp.com?x=1",
      "demo-vadevi.firebaseapp.com#f",
    ]) {
      expect(
        firebaseAuthUpstream({ FIREBASE_AUTH_DOMAIN: host, FIREBASE_AUTH_PROXY: "true" }),
      ).toBeNull();
    }
  });
});

describe("Firebase auth handler route", () => {
  it("returns a safe not-found when the proxy is not configured", async () => {
    // The local test environment does not enable the proxy.
    const response = await SELF.fetch("https://vadevi.test/__/auth/handler");
    expect(response.status).toBe(404);
  });

  it("does not proxy paths outside the reserved Firebase prefix", async () => {
    for (const path of ["/__/other", "/__auth/handler", "/api/v1/__/auth/handler"]) {
      const response = await SELF.fetch(`https://vadevi.test${path}`);
      // Either the ordinary not-found envelope or an auth challenge, never a
      // forwarded upstream response.
      expect([401, 404]).toContain(response.status);
    }
  });

  it("keeps reporting the configured auth domain while the proxy is off", async () => {
    const response = await SELF.fetch("https://vadevi.test/runtime-config");
    expect(response.status).toBe(200);
    const config = RuntimeConfigResponseSchema.parse(await response.json());
    // With the proxy disabled the browser is told to use Firebase's own domain.
    expect(config.data.firebase.authDomain).not.toBe("vadevi.test");
  });
});
