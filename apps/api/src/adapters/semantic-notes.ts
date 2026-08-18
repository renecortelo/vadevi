import type {
  NoteEmbedding,
  SemanticNoteMatch,
  SemanticNotePort,
  SemanticNoteQuery,
} from "@vadevi/domain";

import type { WorkerBindings } from "../types";

/** The embedding model: multilingual, so all eight locales share one space. */
const embeddingModel = "@cf/baai/bge-m3";

/** Just the Workers AI surface this adapter needs, so a test can pass a fake. */
type Embedder = Readonly<{
  run: (model: string, input: { text: string[] }) => Promise<{ data?: number[][] }>;
}>;

/** Just the Vectorize surface this adapter needs, structurally met by the real
 *  binding and by a fake in tests. */
type VectorStore = Readonly<{
  deleteByIds: (ids: string[]) => Promise<unknown>;
  query: (
    values: number[],
    options: { returnMetadata: "all"; topK: number },
  ) => Promise<{
    matches: Array<{ id: string; metadata?: Record<string, unknown>; score: number }>;
  }>;
  upsert: (
    vectors: Array<{ id: string; metadata?: Record<string, unknown>; values: number[] }>,
  ) => Promise<unknown>;
}>;

/**
 * Vector search over notes, backed by Workers AI embeddings and a Vectorize
 * index.
 *
 * The note's text is embedded but never stored in the index — only the vector
 * and the ids needed to fetch the note from the database again, behind the same
 * membership check. Space isolation is enforced here, on the returned metadata,
 * rather than trusted to a filter expression: a match whose Space the reader may
 * not see is dropped before it is ever returned.
 */
export class VectorizeSemanticNoteAdapter implements SemanticNotePort {
  constructor(
    private readonly embedder: Embedder,
    private readonly store: VectorStore,
  ) {}

  private async embed(text: string): Promise<number[] | null> {
    const trimmed = text.trim().slice(0, 4_000);
    if (trimmed.length === 0) return null;
    try {
      const output = await this.embedder.run(embeddingModel, { text: [trimmed] });
      const vector = output.data?.[0];
      return Array.isArray(vector) && vector.length > 0 ? vector : null;
    } catch {
      return null;
    }
  }

  async index(input: NoteEmbedding): Promise<void> {
    const values = await this.embed(input.text);
    if (values === null) return;
    await this.store.upsert([
      { id: input.noteId, metadata: { spaceId: input.spaceId, wineId: input.wineId }, values },
    ]);
  }

  async remove(noteIds: readonly string[]): Promise<void> {
    if (noteIds.length === 0) return;
    await this.store.deleteByIds([...noteIds]);
  }

  async search(input: SemanticNoteQuery): Promise<SemanticNoteMatch[]> {
    const allowed = new Set(input.spaceIds);
    if (allowed.size === 0 || input.limit <= 0) return [];
    const values = await this.embed(input.query);
    if (values === null) return [];
    // Over-fetch so that dropping matches outside the reader's Spaces still
    // leaves enough, then keep only those they may see.
    const response = await this.store.query(values, {
      returnMetadata: "all",
      topK: Math.min(100, input.limit * 5),
    });
    const matches: SemanticNoteMatch[] = [];
    for (const match of response.matches) {
      const spaceId = match.metadata?.spaceId;
      const wineId = match.metadata?.wineId;
      if (typeof spaceId !== "string" || typeof wineId !== "string" || !allowed.has(spaceId)) {
        continue;
      }
      matches.push({ noteId: match.id, score: match.score, spaceId, wineId });
      if (matches.length >= input.limit) break;
    }
    return matches;
  }
}

/**
 * The port when both halves are present: the Vectorize index binding and Workers
 * AI for embeddings. Missing either — the public default — leaves semantic note
 * search off, exactly like the other optional providers.
 */
export function createSemanticNotePort(environment: WorkerBindings): SemanticNotePort | null {
  if (environment.NOTE_INDEX === undefined || environment.AI === undefined) return null;
  return new VectorizeSemanticNoteAdapter(
    environment.AI as unknown as Embedder,
    environment.NOTE_INDEX as unknown as VectorStore,
  );
}
