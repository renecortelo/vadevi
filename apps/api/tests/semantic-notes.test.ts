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
    await adapter.index({
      noteId: "n1",
      spaceId: "s1",
      text: "molt fresc i mineral",
      wineId: "w1",
    });
    expect(upserts).toEqual([
      { id: "n1", metadata: { spaceId: "s1", wineId: "w1" }, values: [0.1, 0.2, 0.3] },
    ]);
    // The reader's words are embedded, but the vector store never holds them.
    expect(JSON.stringify(upserts)).not.toContain("mineral");
  });

  it("returns only matches within the Spaces the reader may see", async () => {
    const { adapter } = harness([
      { id: "n1", metadata: { spaceId: "s1", wineId: "w1" }, score: 0.9 },
      { id: "n2", metadata: { spaceId: "other-space", wineId: "w2" }, score: 0.85 },
      { id: "n3", metadata: { spaceId: "s1", wineId: "w3" }, score: 0.7 },
    ]);
    const matches = await adapter.search({ limit: 5, query: "vinos minerales", spaceIds: ["s1"] });
    // The match from a Space the reader is not in is dropped, not returned.
    expect(matches.map((match) => match.noteId)).toEqual(["n1", "n3"]);
    expect(matches.every((match) => match.spaceId === "s1")).toBe(true);
  });

  it("respects the limit and returns nothing without a Space", async () => {
    const { adapter } = harness([
      { id: "n1", metadata: { spaceId: "s1", wineId: "w1" }, score: 0.9 },
      { id: "n2", metadata: { spaceId: "s1", wineId: "w2" }, score: 0.8 },
    ]);
    expect((await adapter.search({ limit: 1, query: "x", spaceIds: ["s1"] })).length).toBe(1);
    expect(await adapter.search({ limit: 5, query: "x", spaceIds: [] })).toEqual([]);
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
