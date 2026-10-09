import {
  BootstrapResponseSchema,
  ErrorEnvelopeSchema,
  ExportDocumentSchema,
  TasteDeclarationResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { emulatorIdToken } from "./fixtures/firebase-token";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const token = emulatorIdToken({
  email: "declared@example.test",
  name: "Declared",
  sub: "firebase-emulator-user-taste-declaration",
});
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const url = "https://vadevi.test/api/v1/me/taste-declaration";

const words = {
  budget: { currency: "EUR", highMinor: 3_000, lowMinor: 1_500 },
  dislikes: "Mucha madera",
  exploring: "Portugal",
  likes: "Tintos frescos de altura",
  note: null,
};

describe("what the reader says of their taste", () => {
  it("is empty until said, saved over the version seen, and theirs to export", async () => {
    const me = BootstrapResponseSchema.parse(
      await (await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", { headers })).json(),
    );
    const empty = TasteDeclarationResponseSchema.parse(
      await (await SELF.fetch(url, { headers })).json(),
    ).data;
    expect(empty).toMatchObject({ likes: null, version: 0 });

    const save = (body: object) =>
      SELF.fetch(url, { body: JSON.stringify(body), headers, method: "PUT" });
    const first = await save({ ...words, version: 0 });
    expect(first.status).toBe(200);
    const saved = TasteDeclarationResponseSchema.parse(await first.json()).data;
    expect(saved).toMatchObject({
      exploring: "Portugal",
      likes: "Tintos frescos de altura",
      version: 1,
    });

    // Saved meanwhile from elsewhere: a conflict, with what is there now.
    const stale = await save({ ...words, likes: "Otra cosa", version: 0 });
    expect(stale.status).toBe(409);
    const conflict = ErrorEnvelopeSchema.parse(await stale.json());
    expect(conflict.error.code).toBe("VERSION_CONFLICT");

    // An emptied field is cleared, not kept.
    const second = await save({ ...words, exploring: "", version: 1 });
    expect(TasteDeclarationResponseSchema.parse(await second.json()).data).toMatchObject({
      exploring: null,
      version: 2,
    });

    // A budget whose low end is above its high end is refused.
    const inverted = await save({
      ...words,
      budget: { currency: "EUR", highMinor: 1_000, lowMinor: 2_000 },
      version: 2,
    });
    expect(inverted.status).toBe(400);

    // Exported with the reader's personal Space.
    const exported = ExportDocumentSchema.parse(
      await (
        await SELF.fetch(`https://vadevi.test/api/v1/spaces/${me.data.user.activeSpaceId}/export`, {
          headers,
        })
      ).json(),
    );
    expect(exported.data.tasteDeclaration).toMatchObject({
      dislikes: "Mucha madera",
      likes: "Tintos frescos de altura",
    });
  });
});
