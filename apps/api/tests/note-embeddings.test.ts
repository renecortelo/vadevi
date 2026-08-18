import type { NoteEmbedding, SemanticNoteMatch } from "@vadevi/domain";
import { BootstrapResponseSchema, CreateWineResponseSchema } from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { indexPendingNoteEmbeddings } from "../src/repositories/note-embeddings";
import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const token = emulatorIdToken({
  email: "note-embed@example.test",
  name: "Note Embed",
  sub: "firebase-emulator-user-note-embeddings",
});

function fakePort() {
  const indexed: NoteEmbedding[] = [];
  return {
    indexed,
    port: {
      index: async (input: NoteEmbedding) => {
        indexed.push(input);
      },
      remove: async () => {},
      search: async (): Promise<SemanticNoteMatch[]> => [],
    },
  };
}

async function seedNote(comment: string | null): Promise<{ id: string; spaceId: string }> {
  const bootstrap = BootstrapResponseSchema.parse(
    await (
      await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json(),
  );
  const spaceId = bootstrap.data.user.activeSpaceId;
  const wine = CreateWineResponseSchema.parse(
    await (
      await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
        body: JSON.stringify({
          displayName: "Embed Target",
          identityStatus: "confirmed",
          nonVintage: false,
          producerName: "Synthetic Cellar",
          vintageYear: 2024,
        }),
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": randomOpaqueToken(),
        },
        method: "POST",
      })
    ).json(),
  ).data.wine;

  const noteId = randomOpaqueToken();
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO tasting_notes
      (id, space_id, wine_id, author_user_id, mode, state, tasted_at, comment, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'quick', 'submitted', ?, ?, 1, ?, ?)`,
  )
    .bind(noteId, spaceId, wine.id, bootstrap.data.user.id, now, comment, now, now)
    .run();
  return { id: noteId, spaceId };
}

describe("lazy note embedding", () => {
  it("embeds a note with a comment and marks it done", async () => {
    const note = await seedNote("molt fresc i mineral");
    const { indexed, port } = fakePort();

    const result = await indexPendingNoteEmbeddings(env.DB, port, new Date().toISOString());
    expect(result.embedded).toBeGreaterThanOrEqual(1);
    const mine = indexed.find((entry) => entry.noteId === note.id);
    expect(mine).toMatchObject({
      noteId: note.id,
      spaceId: note.spaceId,
      text: "molt fresc i mineral",
    });

    // Marked embedded, so a second run does not send it again.
    const second = fakePort();
    await indexPendingNoteEmbeddings(env.DB, second.port, new Date().toISOString());
    expect(second.indexed.some((entry) => entry.noteId === note.id)).toBe(false);
  });

  it("marks a note with no comment done without embedding it", async () => {
    const note = await seedNote(null);
    const { indexed, port } = fakePort();

    await indexPendingNoteEmbeddings(env.DB, port, new Date().toISOString());
    expect(indexed.some((entry) => entry.noteId === note.id)).toBe(false);

    const embeddedAt = await env.DB.prepare(`SELECT embedded_at FROM tasting_notes WHERE id = ?`)
      .bind(note.id)
      .first<{ embedded_at: string | null }>();
    expect(embeddedAt?.embedded_at).not.toBeNull();
  });

  it("leaves a note pending when embedding throws, to retry next run", async () => {
    const note = await seedNote("this call will fail once");
    const throwingPort = {
      index: async () => {
        throw new Error("embedding unavailable");
      },
      remove: async () => {},
      search: async (): Promise<SemanticNoteMatch[]> => [],
    };

    await indexPendingNoteEmbeddings(env.DB, throwingPort, new Date().toISOString());
    const row = await env.DB.prepare(`SELECT embedded_at FROM tasting_notes WHERE id = ?`)
      .bind(note.id)
      .first<{ embedded_at: string | null }>();
    expect(row?.embedded_at).toBeNull();
  });
});
