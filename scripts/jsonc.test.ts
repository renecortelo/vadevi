import { describe, expect, it } from "vitest";

import { parseJsonc } from "./jsonc";

describe("reading a Wrangler configuration", () => {
  it("drops comments and trailing commas, and keeps a // inside a string", () => {
    const text = `{
      // Who may sign in.
      "vars": {
        "ACCESS_MODE": "allowlist", /* set per deployment */
        "EXTERNAL_API_USER_AGENT": "VaDeVi/0.1 (https://example.invalid/contact)",
        "QUOTED": "a \\"quoted // slash\\" stays",
      },
      "list": [1, 2, 3,],
    }`;
    expect(parseJsonc(text)).toEqual({
      list: [1, 2, 3],
      vars: {
        ACCESS_MODE: "allowlist",
        EXTERNAL_API_USER_AGENT: "VaDeVi/0.1 (https://example.invalid/contact)",
        QUOTED: 'a "quoted // slash" stays',
      },
    });
  });

  it("leaves real JSON errors to JSON.parse", () => {
    expect(() => parseJsonc('{ "unterminated": ')).toThrow();
  });
});
