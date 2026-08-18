/**
 * Semantic search over the reader's own tasting and personal notes.
 *
 * A note logged in one language must be findable from a question asked in
 * another — "molt fresc i mineral" from "vinos minerales" — so notes are matched
 * by meaning, not by shared words. This is the retrieval half of the grounded
 * sommelier: it only ever surfaces the reader's own notes, and every space it
 * may look in is passed in explicitly, so isolation is the caller's to state and
 * the adapter's to enforce.
 *
 * The port is deliberately free of any vector-store or embedding detail; the
 * adapter behind it embeds and talks to the index.
 */

export type NoteEmbedding = Readonly<{
  noteId: string;
  spaceId: string;
  text: string;
  wineId: string;
}>;

export type SemanticNoteQuery = Readonly<{
  limit: number;
  query: string;
  /** The Spaces the reader may see; a match outside them is never returned. */
  spaceIds: readonly string[];
}>;

export type SemanticNoteMatch = Readonly<{
  noteId: string;
  /** Cosine similarity in [0, 1]; higher is closer. */
  score: number;
  spaceId: string;
  wineId: string;
}>;

export interface SemanticNotePort {
  /** Add or replace one note's embedding. Safe to call again on edit. */
  index(input: NoteEmbedding): Promise<void>;
  /** Remove notes by id — on deletion, or when a Space is purged. */
  remove(noteIds: readonly string[]): Promise<void>;
  /** The reader's most semantically similar notes, within their Spaces. */
  search(input: SemanticNoteQuery): Promise<SemanticNoteMatch[]>;
}
