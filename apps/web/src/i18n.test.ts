import { afterEach, describe, expect, it } from "vitest";

import { changeLanguage, i18n } from "./i18n";

describe("localized catalog loading", () => {
  afterEach(async () => changeLanguage("en"));

  it("loads a non-default catalog before changing language", async () => {
    await changeLanguage("es");

    expect(i18n.language).toBe("es");
    expect(i18n.t("sessions.title")).toBe("Eventos de cata");
  });
  it("resolves every key the saved-tasting view renders", async () => {
    // The read-only tasting view once used keys that did not exist — tanninLevel,
    // finishLength, tasting.value.<sentiment> — and showed the raw key on screen.
    // These are the exact keys it renders; a missing one returns the key itself.
    await changeLanguage("es");
    const keys = [
      "tasting.field.acidity",
      "tasting.field.tannin",
      "tasting.field.body",
      "tasting.field.sweetness",
      "tasting.field.finish",
      "tasting.field.balance",
      "tasting.field.noseText",
      "tasting.field.palateText",
      "tasting.field.conclusionText",
      "tasting.field.food",
      "tasting.step.appearance",
      "tasting.step.nose",
      "tasting.step.palate",
      "quickLog.sentimentValue.like",
      "quickLog.sentimentValue.neutral",
      "quickLog.sentimentValue.dislike",
    ];
    for (const key of keys) {
      // i18next returns the key unchanged when it is missing, so a real
      // translation is simply one that differs from its own key.
      expect(i18n.t(key), key).not.toBe(key);
    }
  });
});
