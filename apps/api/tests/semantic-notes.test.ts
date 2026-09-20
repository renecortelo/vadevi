import { describe, expect, it } from "vitest";

import {
  createSemanticNotePort,
  VectorizeSemanticNoteAdapter,
} from "../src/adapters/semantic-notes";

type Upsert = { id: string; metadata?: Record<string, unknown>; values: number[] };
type Match = { id: string; metadata?: Record<string, unknown>; score: number };

function harness(matches: Match[] = []) {
  const upserts: Upsert[] = [];
  const deletes: string[] = [];
  const embedder = {
    run: async (_model: string, input: { text: string[] }) => ({
      data: input.text.map(() => [0.1, 0.2, 0.3]),
    }),
  };
  const store = {
    deleteByIds: async (ids: string[]) => {
      deletes.push(...ids);
    },
    query: async () => ({ matches }),
    upsert: async (vectors: Upsert[]) => {
      upserts.push(...vectors);
    },
  };
  return { adapter: new VectorizeSemanticNoteAdapter(embedder, store), deletes, upserts };
}

describe("semantic note search", () => {
  it("embeds a note and stores only its ids — never the note text", async () => {
    const { adapter, upserts } = harness();
    await expect(
      adapter.index({
        authorUserId: "u1",
        noteId: "n1",
        spaceId: "s1",
        text: "molt fresc i mineral",
        wineId: "w1",
      }),
    ).resolves.toBe(true);
    expect(upserts).toEqual([
      {
        id: "n1",
        metadata: { authorUserId: "u1", spaceId: "s1", wineId: "w1" },
        values: [0.1, 0.2, 0.3],
      },
    ]);
    // The reader's words are embedded, but the vector store never holds them.
    expect(JSON.stringify(upserts)).not.toContain("mineral");
  });

  it("reports nothing stored when the model returns no vector", async () => {
    const embedder = { run: async () => ({ data: [] }) };
    const store = {
      deleteByIds: async () => {},
      query: async () => ({ matches: [] }),
      upsert: async () => {
        throw new Error("must not be reached");
      },
    };
    const adapter = new VectorizeSemanticNoteAdapter(embedder, store);
    await expect(
      adapter.index({ authorUserId: "u1", noteId: "n1", spaceId: "s1", text: "x", wineId: "w1" }),
    ).resolves.toBe(false);
  });

  it("returns only matches within the Spaces the reader may see", async () => {
    const { adapter } = harness([
      { id: "n1", metadata: { authorUserId: "u1", spaceId: "s1", wineId: "w1" }, score: 0.9 },
      {
        id: "n2",
        metadata: { authorUserId: "u1", spaceId: "other-space", wineId: "w2" },
        score: 0.85,
      },
      { id: "n3", metadata: { authorUserId: "u1", spaceId: "s1", wineId: "w3" }, score: 0.7 },
    ]);
    const matches = await adapter.search({
      authorUserId: "u1",
      limit: 5,
      query: "vinos minerales",
      spaceIds: ["s1"],
    });
    // The match from a Space the reader is not in is dropped, not returned.
    expect(matches.map((match) => match.noteId)).toEqual(["n1", "n3"]);
    expect(matches.every((match) => match.spaceId === "s1")).toBe(true);
  });

  it("returns only the reader's own notes, never a co-member's from a shared Space", async () => {
    const { adapter } = harness([
      // A co-member's note in the SAME Space, closest in meaning.
      { id: "theirs", metadata: { authorUserId: "u2", spaceId: "s1", wineId: "w1" }, score: 0.95 },
      // Indexed before authorship was recorded: treated as somebody else's.
      { id: "legacy", metadata: { spaceId: "s1", wineId: "w2" }, score: 0.9 },
      { id: "mine", metadata: { authorUserId: "u1", spaceId: "s1", wineId: "w3" }, score: 0.6 },
    ]);
    const matches = await adapter.search({
      authorUserId: "u1",
      limit: 5,
      query: "x",
      spaceIds: ["s1"],
    });
    expect(matches.map((match) => match.noteId)).toEqual(["mine"]);
  });

  it("respects the limit and returns nothing without a Space", async () => {
    const { adapter } = harness([
      { id: "n1", metadata: { authorUserId: "u1", spaceId: "s1", wineId: "w1" }, score: 0.9 },
      { id: "n2", metadata: { authorUserId: "u1", spaceId: "s1", wineId: "w2" }, score: 0.8 },
    ]);
    const reader = { authorUserId: "u1", query: "x" };
    expect((await adapter.search({ ...reader, limit: 1, spaceIds: ["s1"] })).length).toBe(1);
    expect(await adapter.search({ ...reader, limit: 5, spaceIds: [] })).toEqual([]);
  });

  it("removes notes by id", async () => {
    const { adapter, deletes } = harness();
    await adapter.remove(["n1", "n2"]);
    expect(deletes).toEqual(["n1", "n2"]);
  });

  it("is off unless both the index binding and Workers AI are present", () => {
    expect(createSemanticNotePort({})).toBeNull();
    expect(createSemanticNotePort({ NOTE_INDEX: {} as never })).toBeNull();
    expect(createSemanticNotePort({ AI: {} as never })).toBeNull();
    expect(createSemanticNotePort({ AI: {} as never, NOTE_INDEX: {} as never })).not.toBeNull();
  });
});
