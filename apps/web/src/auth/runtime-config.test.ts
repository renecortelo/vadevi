import { afterEach, describe, expect, it } from "vitest";

import { rememberedRuntimeConfig, rememberRuntimeConfig } from "./runtime-config";

/**
 * A cold launch with no network used to die before Firebase could restore the
 * session it had persisted, because the runtime configuration is network-only
 * by policy and nothing remembered the last one served. The end-to-end drills
 * cannot show that: they run against the emulator, whose fallback path never
 * throws. This pins the mechanism the production path now rests on.
 */

const config = {
  data: {
    appEnvironment: "preview" as const,
    features: {
      assistant: true,
      externalResearch: false,
      priceLookup: false,
      venuePlaceSearch: false,
      voiceInput: false,
    },
    firebase: {
      apiKey: "public-web-key",
      authDomain: "example.invalid",
      projectId: "example-project",
    },
  },
};

const store = new Map<string, string>();
const storage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
};
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });

afterEach(() => store.clear());

describe("remembered runtime configuration", () => {
  it("comes back exactly as it was served", () => {
    rememberRuntimeConfig(config);
    expect(rememberedRuntimeConfig()).toEqual(config);
  });

  it("is nothing rather than a guess when nothing was ever served", () => {
    expect(rememberedRuntimeConfig()).toBeNull();
  });

  it("discards a stored value that no longer matches the contract", () => {
    // A hand-edited or pre-contract value must not be trusted into Firebase.
    store.set("vadevi.runtimeConfig", JSON.stringify({ data: { firebase: {} } }));
    expect(rememberedRuntimeConfig()).toBeNull();
    store.set("vadevi.runtimeConfig", "not json");
    expect(rememberedRuntimeConfig()).toBeNull();
  });
});
