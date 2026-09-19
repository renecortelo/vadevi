import type { Fact } from "@vadevi/contracts";
import type { ResearchLocale, TranslationPort } from "@vadevi/domain";

import { translationBatches } from "../adapters/translation";

/**
 * The predicates whose value is prose in some language, as opposed to a name, a
 * code, a year or a country. Only these are ever translated: a translated grape
 * code is a broken code, and a translated producer name is a different producer.
 */
export const TRANSLATED_FACT_PREDICATES: ReadonlySet<Fact["predicate"]> = new Set([
  "curiosity.highlight",
  "curiosity.note",
  "further_reading.summary",
  "pairing.note",
  "producer.history",
  "research.summary",
  "tasting.comparison",
]);

/** A fact as the list query reads it, with the language its text was written in
 *  — null for facts recorded before that was kept, whose language is unknown. */
export type LocalizableFact = Readonly<{ fact: Fact; locale: string | null }>;

type TranslationRow = { fact_id: string; source_title: string | null; value_json: string };

/** What one read is allowed to spend: past this, the rest of the page stays in
 *  its written language until the next visit. Each batch is one model call. */
const maxBatchesPerRead = 3;

/**
 * The facts as a reader in `locale` should see them.
 *
 * A fact keeps its text in the language it was written in; what changes with the
 * reader's language is the translation laid over it. Translations are made the
 * first time someone reads the wine in a language and kept, so a wine is
 * translated once per language and never on every visit — and never rewritten,
 * so the record and its citations stay exactly what research found.
 *
 * Facts already in the reader's language are left alone. Facts whose language
 * was never recorded are sent through the translator, which returns a text
 * unchanged when it is already in the target language, and the result is kept
 * so that question is asked once.
 *
 * Every model call is paid for through `reserveModelCall`; when that refuses,
 * whatever is translated so far is returned and the rest reads as written. The
 * page is never blocked on a budget.
 */
export async function localizeFacts(
  database: D1Database,
  options: {
    facts: readonly LocalizableFact[];
    locale: ResearchLocale;
    reserveModelCall: () => Promise<boolean>;
    translation: TranslationPort | null;
  },
): Promise<Fact[]> {
  const candidates = options.facts.filter(
    ({ fact, locale }) =>
      TRANSLATED_FACT_PREDICATES.has(fact.predicate) &&
      typeof fact.value === "string" &&
      fact.status !== "retired" &&
      locale !== options.locale,
  );
  const plain = options.facts.map(({ fact }) => fact);
  if (candidates.length === 0) return plain;

  const translated = new Map<string, { title: string | null; value: string }>();
  const placeholders = candidates.map(() => "?").join(", ");
  const stored = await database
    .prepare(
      `SELECT fact_id, value_json, source_title FROM fact_translations
      WHERE locale = ? AND fact_id IN (${placeholders})`,
    )
    .bind(options.locale, ...candidates.map(({ fact }) => fact.id))
    .all<TranslationRow>();
  for (const row of stored.results) {
    try {
      const value = JSON.parse(row.value_json) as unknown;
      if (typeof value === "string")
        translated.set(row.fact_id, { title: row.source_title, value });
    } catch {
      // A row that cannot be read is treated as absent and made again below.
    }
  }

  const missing = candidates.filter(({ fact }) => !translated.has(fact.id));
  if (missing.length > 0 && options.translation !== null) {
    await translateMissing(database, missing, translated, options);
  }

  return options.facts.map(({ fact }) => {
    const patch = translated.get(fact.id);
    if (patch === undefined) return fact;
    const first = fact.citations[0];
    return {
      ...fact,
      value: patch.value,
      // The page title that heads a web note is translated with it, and shown
      // only from here: the source row itself is shared and stays as retrieved.
      citations:
        patch.title === null || first === undefined
          ? fact.citations
          : [
              { ...first, source: { ...first.source, title: patch.title } },
              ...fact.citations.slice(1),
            ],
    };
  });
}

/** Whether this fact leads with its source's page title, which then needs
 *  translating alongside the text. */
function carriesTitle(fact: Fact): boolean {
  return (
    (fact.predicate === "curiosity.note" || fact.predicate === "pairing.note") &&
    fact.citations[0] !== undefined
  );
}

async function translateMissing(
  database: D1Database,
  missing: readonly LocalizableFact[],
  translated: Map<string, { title: string | null; value: string }>,
  options: {
    locale: ResearchLocale;
    reserveModelCall: () => Promise<boolean>;
    translation: TranslationPort | null;
  },
): Promise<void> {
  const translation = options.translation;
  if (translation === null) return;
  // One flat list of texts, each remembering the fact and the slot it fills, so
  // a batch boundary can fall anywhere — even between a note's title and body.
  const slots: { factId: string; kind: "title" | "value" }[] = [];
  const texts: string[] = [];
  for (const { fact } of missing) {
    if (carriesTitle(fact)) {
      slots.push({ factId: fact.id, kind: "title" });
      texts.push(fact.citations[0]!.source.title);
    }
    slots.push({ factId: fact.id, kind: "value" });
    texts.push(String(fact.value));
  }

  // Reserve first, one call per batch, then run the batches together: a page
  // of evidence is two or three of them, each a dozen seconds on the model, and
  // the reader is waiting on the sum. Reservation stays sequential so the cap
  // is honoured exactly; only the model calls overlap.
  const reserved: number[][] = [];
  for (const batch of translationBatches(texts).slice(0, maxBatchesPerRead)) {
    if (!(await options.reserveModelCall())) break;
    reserved.push(batch);
  }
  const results = await Promise.all(
    reserved.map(async (batch) => {
      try {
        return await translation.translate({
          locale: options.locale,
          texts: batch.map((index) => texts[index]!),
        });
      } catch {
        return null;
      }
    }),
  );

  const patches = new Map<string, { title?: string; value?: string }>();
  const completed = new Set<string>();
  reserved.forEach((batch, batchIndex) => {
    const result = results[batchIndex];
    if (result === null || result === undefined || result.length !== batch.length) return;
    batch.forEach((index, position) => {
      const slot = slots[index]!;
      // An item the translator would not return keeps its original: stored as
      // such, so the same untranslatable text is not sent again on every visit.
      const value = result[position] ?? texts[index]!;
      patches.set(slot.factId, { ...patches.get(slot.factId), [slot.kind]: value });
      completed.add(`${slot.factId}:${slot.kind}`);
    });
  });

  const now = new Date().toISOString();
  const inserts: D1PreparedStatement[] = [];
  for (const { fact } of missing) {
    const patch = patches.get(fact.id);
    // A note whose title crossed the cut-off but whose body did not is left for
    // next time, whole; half a translation is not kept.
    if (patch?.value === undefined || (carriesTitle(fact) && !completed.has(`${fact.id}:title`))) {
      continue;
    }
    const title = patch.title ?? null;
    translated.set(fact.id, { title, value: patch.value });
    inserts.push(
      database
        .prepare(
          `INSERT OR IGNORE INTO fact_translations (
            fact_id, locale, value_json, source_title, created_at
          ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(fact.id, options.locale, JSON.stringify(patch.value), title, now),
    );
  }
  if (inserts.length > 0) await database.batch(inserts);
}
