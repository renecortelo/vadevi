import { describe, expect, it } from "vitest";

import { questionIsUnclear } from "../src/repositories/assistant-question";

/**
 * "¿Qué" and Enter, before the rest of the question was typed, reached the
 * model, which answered something. A message that asks nothing is now met
 * with a request to rephrase; anything that names something goes through.
 */
describe("a question that asks nothing", () => {
  it("is recognised in any of the eight languages", () => {
    for (const message of [
      "¿Qué",
      "qué?",
      "¿y?",
      "Hola",
      "Hola, ¿qué tal?",
      "¿Por qué?",
      "what",
      "Hi there",
      "Quoi ?",
      "Was?",
      "Cosa?",
      "Wat?",
      "O quê?",
      "Què?",
      "...",
      "   ",
    ]) {
      expect(questionIsUnclear(message), message).toBe(true);
    }
  });

  it("never stops a question that names something", () => {
    for (const message of [
      "garnacha",
      "¿Qué sabes de la garnacha?",
      "Rioja?",
      "¿qué tengo?",
      "¿Cuántos vinos he probado?",
      "¿con qué lo marido?",
      "y con pescado?",
      "2019",
      "What about Barolo?",
      "Mas La Plana",
      "Ull de Llebre",
    ]) {
      expect(questionIsUnclear(message), message).toBe(false);
    }
  });
});
