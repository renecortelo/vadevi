import { afterEach, describe, expect, it } from "vitest";

import { changeLanguage, i18n } from "./i18n";

describe("localized catalog loading", () => {
  afterEach(async () => changeLanguage("en"));

  it("loads a non-default catalog before changing language", async () => {
    await changeLanguage("es");

    expect(i18n.language).toBe("es");
    expect(i18n.t("sessions.title")).toBe("Sesiones de cata");
  });
});
