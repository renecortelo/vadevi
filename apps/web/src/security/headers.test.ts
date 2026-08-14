import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The deployed security headers are only exercised by a real deployment: the
 * Vite dev server does not apply `_headers`, and the local Auth Emulator never
 * contacts Google. A preview deployment caught this the hard way, so the policy
 * is pinned here.
 *
 * These assertions are about the *sign-in path specifically*. Loosening any of
 * them breaks authentication in production while every local check still passes.
 */
const headers = readFileSync(resolve(import.meta.dirname, "../../public/_headers"), "utf8");

function directive(name: string): string {
  const policy = headers.match(/Content-Security-Policy:\s*(.+)/)?.[1] ?? "";
  return (
    policy
      .split(";")
      .find((part) => part.trim().startsWith(`${name} `))
      ?.trim() ?? ""
  );
}

describe("deployed security headers", () => {
  it("lets Firebase Auth reach its identity endpoints", () => {
    const connect = directive("connect-src");
    // Without these the SDK cannot exchange tokens and fails with the opaque
    // `auth/internal-error`, which names nothing useful.
    expect(connect).toContain("https://identitytoolkit.googleapis.com");
    expect(connect).toContain("https://securetoken.googleapis.com");
    expect(connect).toContain("'self'");
  });

  it("allows the sign-in popup to hand its result back", () => {
    // `same-origin` puts the popup in another browsing context group and severs
    // window.opener, which is exactly how the popup returns its credential.
    expect(headers).toContain("Cross-Origin-Opener-Policy: same-origin-allow-popups");
    expect(headers).not.toMatch(/Cross-Origin-Opener-Policy:\s*same-origin\s*$/m);
  });

  it("permits the Google scripts and frame the auth handler needs", () => {
    expect(directive("script-src")).toContain("https://apis.google.com");
    expect(directive("frame-src")).toContain("https://accounts.google.com");
  });

  it("keeps the rest of the policy closed", () => {
    // Relaxing the sign-in path must not turn into a blanket allowance.
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(headers).toContain("object-src 'none'");
    expect(headers).toContain("base-uri 'none'");
    expect(headers).toContain("frame-ancestors 'none'");
    expect(directive("connect-src")).not.toContain("*");
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
    expect(directive("script-src")).not.toContain("'unsafe-eval'");
  });
});
