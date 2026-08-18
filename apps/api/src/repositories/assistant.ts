import type {
  AssistantRecommendation,
  AssistantSearchResult,
  AssistantTasteProfile,
  AssistantTurnRequest,
  AssistantTurnResponse,
  AssistantWineComparison,
  AssistantWineContext,
  Fact,
  PriceObservation,
  Source,
  SupportedLocale,
  WineSummary,
} from "@vadevi/contracts";
import type {
  AssistantLanguagePort,
  AssistantLanguageStatement,
  SemanticNotePort,
} from "@vadevi/domain";
import { ulid } from "ulid";

import { sha256Base64Url } from "../security/opaque-token";
import type { FirebasePrincipal } from "../types";
import { listPriceObservations } from "./cellar";
import { getSource, listWineFacts } from "./provenance";
import { getWineSummary, listWines, normalizeWineText } from "./wine-memory";

type AllowedSpaceRow = {
  actor_user_id: string;
  id: string;
  name: string;
};

const ignoredTerms = new Set(
  normalizeWineText(
    [
      "a an and bottle bottles fetch find for from http https i ignore in instructions is me memory my of on or our please previous show system that the this to was we what which wine wines with",
      "el la los las un una unos unas y o de del en con para por mi mis nuestro nuestra que cual vino vinos botella botellas buscar muestra",
      "el la els les un una uns unes i o de del en amb per meu meva nostre nostra que quin vi vins ampolla ampolles cerca mostra",
      "le la les un une des et ou de du dans avec pour mon ma mes notre que quel vin vins bouteille bouteilles trouver montre",
      "il lo la i gli le un una e o di del nel con per mio mia nostro nostra che quale vino vini bottiglia bottiglie trova mostra",
      "o a os as um uma e ou de do da em com para meu minha nosso nossa que qual vinho vinhos garrafa garrafas encontra mostra",
      "de het een en of van in met voor mijn ons onze wat welke wijn wijnen fles flessen vind toon",
      "der die das ein eine und oder von im in mit für mein meine unser unsere was welcher wein weine flasche flaschen finde zeige",
    ].join(" "),
  ).split(" "),
);

function searchTerms(message: string): string[] {
  return [
    ...new Set(
      normalizeWineText(message)
        .split(" ")
        .filter((term) => term.length >= 2 && !/^\d+$/.test(term) && !ignoredTerms.has(term)),
    ),
  ].slice(0, 6);
}

function requestsTasteProfile(message: string): boolean {
  const normalized = normalizeWineText(message);
  return /\b(profile|preference|preferences|prefer|favorite|favourite|taste|gust|gusto|gustos|preferencia|preferencias|perfil|gout|gouts|preferenze|smaak|voorkeur|geschmack|praferenz)\b/i.test(
    normalized,
  );
}

function requestsComparison(message: string): boolean {
  const normalized = normalizeWineText(message);
  return /\b(compare|comparison|versus|vs|comparar|comparacion|comparació|compara|comparer|confronta|confronto|vergelijken|vergelijk|vergleichen|vergleich)\b/i.test(
    normalized,
  );
}

function requestsPrice(message: string): boolean {
  const normalized = normalizeWineText(message);
  return /\b(price|prices|cost|offer|offers|precio|precios|preu|preus|prix|prezzo|prezzi|prijs|prijzen|preis|preise|custa|preco|precos)\b/i.test(
    normalized,
  );
}

function requestsRecommendation(message: string): boolean {
  const normalized = normalizeWineText(message);
  return /\b(recommend|recommendation|recommended|buy|recomienda|recomendacion|recomana|recomanacio|recommande|recommandation|consiglia|consiglio|aanbeveling|aanraden|empfehlung|empfehlen|recomenda|recomendacao)\b/i.test(
    normalized,
  );
}

/**
 * A question about the collection as a whole rather than one wine: how many
 * there are, which scored best, the top few, what is in the cellar. These are
 * answered from the reader's own wines, so the turn loads the collection and
 * lets the grounded statements — one per wine, each carrying its score — be
 * counted and ranked, every claim still cited to a wine the reader owns.
 */
function requestsCollectionOverview(message: string): boolean {
  const normalized = normalizeWineText(message);
  return /\b(how many|count|total|totals|highest|best|top|ranking|ranked|most|cuantos|cuantas|total|totales|mejor|mejores|puntuad|top|clasificaci|bodega|cava|celler|probado|probados|catado|catados|combien|meilleur|meilleurs|classement|quanti|quante|migliore|migliori|classifica|hoeveel|beste|meeste|wie viele|beste|meisten|rangliste|quantos|melhor|melhores|classificac)\b/i.test(
    normalized,
  );
}

function confidenceForSample(sampleSize: number): AssistantTasteProfile["confidence"] {
  if (sampleSize < 3) return "insufficient";
  if (sampleSize < 5) return "low";
  if (sampleSize < 10) return "medium";
  return "high";
}

function localizedPersonalBasis(locale: SupportedLocale, count: number): string {
  const copy: Record<SupportedLocale, string> = {
    ca: `Basat en ${count} notes de tast enviades per tu`,
    de: `Basierend auf ${count} deiner eingereichten Verkostungsnotizen`,
    en: `Based on ${count} of your submitted tasting notes`,
    es: `Basado en ${count} notas de cata tuyas enviadas`,
    fr: `Basé sur ${count} de vos notes de dégustation envoyées`,
    it: `Basato su ${count} tue note di degustazione inviate`,
    nl: `Gebaseerd op ${count} van je ingediende proefnotities`,
    "pt-PT": `Baseado em ${count} notas de prova submetidas por si`,
  };
  return copy[locale]!;
}

function localizedCopy(
  locale: SupportedLocale,
  kind: "evidence" | "found" | "found_failed" | "not_found" | "not_found_failed",
  count: number,
): string {
  const copy: Record<SupportedLocale, Record<typeof kind, string>> = {
    ca: {
      evidence: `${count} registres coincidents de Wine Memory`,
      found: `He trobat ${count} ${count === 1 ? "vi coincident" : "vins coincidents"} a la Wine Memory autoritzada. La IA està desactivada: és una cerca estructurada directa, no una resposta generada.`,
      found_failed: `He trobat ${count} ${count === 1 ? "vi coincident" : "vins coincidents"} a la Wine Memory autoritzada. La IA no ha pogut respondre ara mateix: és una cerca estructurada directa.`,
      not_found:
        "No he trobat cap coincidència estructurada a la Wine Memory autoritzada. La IA està desactivada, però el registre i la cerca normals continuen disponibles.",
      not_found_failed:
        "No he trobat cap coincidència estructurada a la Wine Memory autoritzada. La IA no ha pogut respondre ara mateix; el registre i la cerca normals continuen disponibles.",
    },
    de: {
      evidence: `${count} passende Wine-Memory-Einträge`,
      found: `Ich habe ${count} passende ${count === 1 ? "Wein" : "Weine"} im autorisierten Wine Memory gefunden. KI ist deaktiviert: Das ist eine direkte strukturierte Suche, keine generierte Antwort.`,
      found_failed: `Ich habe ${count} passende ${count === 1 ? "Wein" : "Weine"} im autorisierten Wine Memory gefunden. Die KI konnte gerade nicht antworten: Das ist eine direkte strukturierte Suche.`,
      not_found:
        "Ich habe im autorisierten Wine Memory keine strukturierte Übereinstimmung gefunden. KI ist deaktiviert, aber Protokollierung und normale Suche bleiben verfügbar.",
      not_found_failed:
        "Ich habe im autorisierten Wine Memory keine strukturierte Übereinstimmung gefunden. Die KI konnte gerade nicht antworten; Protokollierung und normale Suche bleiben verfügbar.",
    },
    en: {
      evidence: `${count} matching Wine Memory ${count === 1 ? "record" : "records"}`,
      found: `I found ${count} matching ${count === 1 ? "wine" : "wines"} in your authorized Wine Memory. AI is off, so this is a direct structured search—not a generated answer.`,
      found_failed: `I found ${count} matching ${count === 1 ? "wine" : "wines"} in your authorized Wine Memory. The AI could not answer just now, so this is a direct structured search.`,
      not_found:
        "I did not find a structured match in your authorized Wine Memory. AI is off, but logging and ordinary search remain available.",
      not_found_failed:
        "I did not find a structured match in your authorized Wine Memory. The AI could not answer just now; logging and ordinary search remain available.",
    },
    es: {
      evidence: `${count} ${count === 1 ? "registro coincidente" : "registros coincidentes"} de Wine Memory`,
      found: `He encontrado ${count} ${count === 1 ? "vino coincidente" : "vinos coincidentes"} en la Wine Memory autorizada. La IA está desactivada: es una búsqueda estructurada directa, no una respuesta generada.`,
      found_failed: `He encontrado ${count} ${count === 1 ? "vino coincidente" : "vinos coincidentes"} en la Wine Memory autorizada. La IA no pudo responder ahora mismo: es una búsqueda estructurada directa.`,
      not_found:
        "No he encontrado ninguna coincidencia estructurada en la Wine Memory autorizada. La IA está desactivada, pero el registro y la búsqueda normales siguen disponibles.",
      not_found_failed:
        "No he encontrado ninguna coincidencia estructurada en la Wine Memory autorizada. La IA no pudo responder ahora mismo; el registro y la búsqueda normales siguen disponibles.",
    },
    fr: {
      evidence: `${count} ${count === 1 ? "entrée correspondante" : "entrées correspondantes"} dans Wine Memory`,
      found: `J’ai trouvé ${count} ${count === 1 ? "vin correspondant" : "vins correspondants"} dans la Wine Memory autorisée. L’IA est désactivée : il s’agit d’une recherche structurée directe, pas d’une réponse générée.`,
      found_failed: `J’ai trouvé ${count} ${count === 1 ? "vin correspondant" : "vins correspondants"} dans la Wine Memory autorisée. L’IA n’a pas pu répondre à l’instant : il s’agit d’une recherche structurée directe.`,
      not_found:
        "Je n’ai trouvé aucune correspondance structurée dans la Wine Memory autorisée. L’IA est désactivée, mais la saisie et la recherche ordinaires restent disponibles.",
      not_found_failed:
        "Je n’ai trouvé aucune correspondance structurée dans la Wine Memory autorisée. L’IA n’a pas pu répondre à l’instant ; la saisie et la recherche ordinaires restent disponibles.",
    },
    it: {
      evidence: `${count} ${count === 1 ? "record corrispondente" : "record corrispondenti"} di Wine Memory`,
      found: `Ho trovato ${count} ${count === 1 ? "vino corrispondente" : "vini corrispondenti"} nella Wine Memory autorizzata. L’IA è disattivata: questa è una ricerca strutturata diretta, non una risposta generata.`,
      found_failed: `Ho trovato ${count} ${count === 1 ? "vino corrispondente" : "vini corrispondenti"} nella Wine Memory autorizzata. L’IA non ha potuto rispondere ora: questa è una ricerca strutturata diretta.`,
      not_found:
        "Non ho trovato corrispondenze strutturate nella Wine Memory autorizzata. L’IA è disattivata, ma la registrazione e la ricerca normali restano disponibili.",
      not_found_failed:
        "Non ho trovato corrispondenze strutturate nella Wine Memory autorizzata. L’IA non ha potuto rispondere ora; la registrazione e la ricerca normali restano disponibili.",
    },
    nl: {
      evidence: `${count} overeenkomende Wine Memory-${count === 1 ? "vermelding" : "vermeldingen"}`,
      found: `Ik vond ${count} overeenkomende ${count === 1 ? "wijn" : "wijnen"} in het geautoriseerde Wine Memory. AI staat uit: dit is een directe gestructureerde zoekopdracht, geen gegenereerd antwoord.`,
      found_failed: `Ik vond ${count} overeenkomende ${count === 1 ? "wijn" : "wijnen"} in het geautoriseerde Wine Memory. De AI kon nu geen antwoord geven: dit is een directe gestructureerde zoekopdracht.`,
      not_found:
        "Ik vond geen gestructureerde overeenkomst in het geautoriseerde Wine Memory. AI staat uit, maar vastleggen en normaal zoeken blijven beschikbaar.",
      not_found_failed:
        "Ik vond geen gestructureerde overeenkomst in het geautoriseerde Wine Memory. De AI kon nu geen antwoord geven; vastleggen en normaal zoeken blijven beschikbaar.",
    },
    "pt-PT": {
      evidence: `${count} ${count === 1 ? "registo correspondente" : "registos correspondentes"} da Wine Memory`,
      found: `Encontrei ${count} ${count === 1 ? "vinho correspondente" : "vinhos correspondentes"} na Wine Memory autorizada. A IA está desativada: esta é uma pesquisa estruturada direta, não uma resposta gerada.`,
      found_failed: `Encontrei ${count} ${count === 1 ? "vinho correspondente" : "vinhos correspondentes"} na Wine Memory autorizada. A IA não conseguiu responder agora: esta é uma pesquisa estruturada direta.`,
      not_found:
        "Não encontrei correspondências estruturadas na Wine Memory autorizada. A IA está desativada, mas o registo e a pesquisa normais continuam disponíveis.",
      not_found_failed:
        "Não encontrei correspondências estruturadas na Wine Memory autorizada. A IA não conseguiu responder agora; o registo e a pesquisa normais continuam disponíveis.",
    },
  };
  return copy[locale]![kind];
}

async function allowedSpaces(
  database: D1Database,
  principal: FirebasePrincipal,
  activeSpaceId: string,
  allowedCrossSpaceIds: string[],
): Promise<AllowedSpaceRow[] | null> {
  const requestedIds = [...new Set([activeSpaceId, ...allowedCrossSpaceIds])];
  const placeholders = requestedIds.map(() => "?").join(", ");
  const result = await database
    .prepare(
      `SELECT actor.id AS actor_user_id, space.id, space.name
      FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
      JOIN spaces space ON space.id = membership.space_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active' AND space.deleted_at IS NULL
        AND space.id IN (${placeholders})`,
    )
    .bind(principal.firebaseUid, ...requestedIds)
    .all<AllowedSpaceRow>();
  if (!result.results.some((space) => space.id === activeSpaceId)) return null;
  const order = new Map(requestedIds.map((id, index) => [id, index]));
  return result.results.sort((left, right) => order.get(left.id)! - order.get(right.id)!);
}

/**
 * The reader's whole collection across the Spaces they may see, ranked by their
 * own score, with the total and how many are scored. Bounded to 100 per Space,
 * which is where the count is honest for all but the largest cellars.
 */
async function loadCollectionOverview(
  database: D1Database,
  principal: FirebasePrincipal,
  spaces: AllowedSpaceRow[],
): Promise<{ scored: number; total: number; wines: AssistantSearchResult[] }> {
  const all = new Map<string, AssistantSearchResult>();
  for (const space of spaces) {
    const response = await listWines(database, {
      limit: 100,
      principal,
      sort: "recent",
      spaceId: space.id,
    });
    for (const wine of response?.data ?? []) {
      all.set(`${space.id}:${wine.id}`, { spaceId: space.id, spaceName: space.name, wine });
    }
  }
  const wines = [...all.values()].sort(
    (left, right) => (right.wine.score100 ?? -1) - (left.wine.score100 ?? -1),
  );
  return {
    scored: wines.filter((entry) => entry.wine.score100 !== null).length,
    total: wines.length,
    wines,
  };
}

/**
 * The reader's own notes that match the question by meaning, and the wines they
 * belong to. The vector index returns note ids; the text and the wine are read
 * back from the database behind the same membership check, so a note is only
 * ever surfaced as the reader's own personal evidence, cited to their note.
 */
async function searchNotesSemantically(
  database: D1Database,
  principal: FirebasePrincipal,
  port: SemanticNotePort,
  message: string,
  spaces: AllowedSpaceRow[],
  limit: number,
): Promise<{ results: AssistantSearchResult[]; statements: AssistantLanguageStatement[] }> {
  const spaceIds = spaces.map((space) => space.id);
  const matches = await port.search({ limit, query: message, spaceIds });
  if (matches.length === 0) return { results: [], statements: [] };
  const noteIds = matches.map((match) => match.noteId);
  const notePlaceholders = noteIds.map(() => "?").join(", ");
  const spacePlaceholders = spaceIds.map(() => "?").join(", ");
  const notes = await database
    .prepare(
      `SELECT note.id, note.comment, note.space_id, note.wine_id
        FROM tasting_notes note
        WHERE note.id IN (${notePlaceholders}) AND note.space_id IN (${spacePlaceholders})
          AND note.deleted_at IS NULL AND note.comment IS NOT NULL AND note.comment <> ''`,
    )
    .bind(...noteIds, ...spaceIds)
    .all<{ comment: string; id: string; space_id: string; wine_id: string }>();
  const spaceById = new Map(spaces.map((space) => [space.id, space]));
  const results = new Map<string, AssistantSearchResult>();
  const statements: AssistantLanguageStatement[] = [];
  for (const note of notes.results) {
    const wine = await getWineSummary(database, principal, note.space_id, note.wine_id);
    if (wine === null) continue;
    const space = spaceById.get(note.space_id);
    results.set(`${note.space_id}:${wine.id}`, {
      spaceId: note.space_id,
      spaceName: space?.name ?? "",
      wine,
    });
    statements.push({
      evidenceClass: "personal",
      id: `note-${note.id}`,
      sampleSize: null,
      sourceIds: [],
      text: `your note on ${wine.displayName}: ${note.comment}`,
    });
  }
  return { results: [...results.values()], statements };
}

async function searchMemory(
  database: D1Database,
  principal: FirebasePrincipal,
  spaces: AllowedSpaceRow[],
  message: string,
  visibleWineId: string | null,
  broadFallback: boolean,
): Promise<{ results: AssistantSearchResult[]; terms: string[] }> {
  const terms = searchTerms(message);
  const results = new Map<string, AssistantSearchResult>();
  for (const space of spaces) {
    const queries = terms.length === 0 ? [undefined] : terms;
    for (const query of queries) {
      // A term is matched against the wine's name, producer and aliases and,
      // separately, its region — so "Parras" finds a wine from Parras even
      // when the word is nowhere in its producer or name. Without the second
      // pass the assistant looked rigid: it knew wines it could not be asked
      // about by where they are from.
      const passes = await Promise.all([
        listWines(database, {
          limit: 10,
          principal,
          ...(query === undefined ? {} : { query }),
          sort: "recent",
          spaceId: space.id,
        }),
        query === undefined
          ? null
          : listWines(database, {
              limit: 10,
              principal,
              region: query,
              sort: "recent",
              spaceId: space.id,
            }),
      ]);
      for (const response of passes) {
        for (const wine of response?.data ?? []) {
          results.set(`${space.id}:${wine.id}`, {
            spaceId: space.id,
            spaceName: space.name,
            wine,
          });
        }
      }
    }
    if (visibleWineId !== null && !results.has(`${space.id}:${visibleWineId}`)) {
      const response = await listWines(database, {
        limit: 100,
        principal,
        sort: "recent",
        spaceId: space.id,
      });
      const wine = response?.data.find((candidate: WineSummary) => candidate.id === visibleWineId);
      if (wine !== undefined) {
        results.set(`${space.id}:${wine.id}`, { spaceId: space.id, spaceName: space.name, wine });
      }
    }
  }
  if (results.size === 0 && broadFallback) {
    for (const space of spaces) {
      const response = await listWines(database, {
        limit: 10,
        principal,
        sort: "recent",
        spaceId: space.id,
      });
      for (const wine of response?.data ?? []) {
        results.set(`${space.id}:${wine.id}`, {
          spaceId: space.id,
          spaceName: space.name,
          wine,
        });
      }
    }
  }
  const ordered = [...results.values()].sort((left, right) => {
    if (visibleWineId === null) return 0;
    return Number(right.wine.id === visibleWineId) - Number(left.wine.id === visibleWineId);
  });
  return { results: ordered.slice(0, 10), terms };
}

type AssistantToolName =
  | "build_recommendation"
  | "compare_wines"
  | "create_action_draft"
  | "find_price_observations"
  | "get_taste_profile"
  | "get_wine_context"
  | "research_wine"
  | "search_memory";

async function auditToolRun(
  database: D1Database,
  options: {
    actorId: string;
    arguments: unknown;
    citationIds?: string[];
    latencyMs: number;
    outcome: "error" | "forbidden" | "insufficient_data" | "not_found" | "ok";
    provider: "cloudflare" | "none";
    resultCount: number;
    ruleVersion: string;
    spaceId: string;
    toolName: AssistantToolName;
    turnId: string;
  },
) {
  const argumentsHash = await sha256Base64Url(JSON.stringify(options.arguments));
  await database
    .prepare(
      `INSERT INTO assistant_tool_runs (
        id, space_id, actor_user_id, turn_id, tool_name, arguments_hash,
        outcome, result_count, citation_ids_json, provider, model_version,
        rule_version, latency_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    )
    .bind(
      ulid(),
      options.spaceId,
      options.actorId,
      options.turnId,
      options.toolName,
      argumentsHash,
      options.outcome,
      options.resultCount,
      JSON.stringify(options.citationIds ?? []),
      options.provider,
      options.ruleVersion,
      options.latencyMs,
      new Date().toISOString(),
    )
    .run();
}

async function getVisibleWineContext(
  database: D1Database,
  principal: FirebasePrincipal,
  results: AssistantSearchResult[],
  visibleWineId: string | null,
): Promise<{ citations: Source[]; context: AssistantWineContext | null }> {
  if (visibleWineId === null) return { citations: [], context: null };
  const visible = results.find((result) => result.wine.id === visibleWineId);
  if (visible === undefined) return { citations: [], context: null };
  const response = await listWineFacts(database, {
    principal,
    spaceId: visible.spaceId,
    wineId: visibleWineId,
  });
  if (response === null) return { citations: [], context: null };
  const citations = new Map<string, Source>();
  for (const fact of response.data.facts) {
    for (const citation of fact.citations) citations.set(citation.source.id, citation.source);
  }
  return {
    citations: [...citations.values()].slice(0, 8),
    context: {
      conflicts: response.data.conflicts.slice(0, 25),
      facts: response.data.facts.slice(0, 50),
      spaceId: visible.spaceId,
      wineId: visibleWineId,
    },
  };
}

async function getCurrentUserTasteProfile(
  database: D1Database,
  principal: FirebasePrincipal,
  spaceId: string,
): Promise<AssistantTasteProfile> {
  const aggregate = await database
    .prepare(
      `SELECT COUNT(*) AS sample_size, AVG(note.score_100) AS average_score,
        SUM(CASE WHEN note.would_buy = 'yes' THEN 1 ELSE 0 END) AS would_buy_yes_count
      FROM tasting_notes note
      JOIN users actor ON actor.id = note.author_user_id
      JOIN space_memberships membership ON membership.space_id = note.space_id
        AND membership.user_id = actor.id
      JOIN spaces space ON space.id = note.space_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active' AND space.deleted_at IS NULL
        AND note.space_id = ? AND note.state = 'submitted' AND note.deleted_at IS NULL`,
    )
    .bind(principal.firebaseUid, spaceId)
    .first<{
      average_score: number | null;
      sample_size: number;
      would_buy_yes_count: number | null;
    }>();
  const sampleSize = aggregate?.sample_size ?? 0;
  const sufficient = sampleSize >= 3;
  const descriptors = sufficient
    ? await database
        .prepare(
          `SELECT descriptor.descriptor_code, COUNT(*) AS uses
          FROM tasting_descriptors descriptor
          JOIN tasting_notes note ON note.id = descriptor.tasting_note_id
            AND note.space_id = descriptor.space_id
          JOIN users actor ON actor.id = note.author_user_id
          WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
            AND note.space_id = ? AND note.state = 'submitted' AND note.deleted_at IS NULL
          GROUP BY descriptor.descriptor_code
          ORDER BY uses DESC, descriptor.descriptor_code
          LIMIT 10`,
        )
        .bind(principal.firebaseUid, spaceId)
        .all<{ descriptor_code: string; uses: number }>()
    : { results: [] };
  return {
    averageScore: sufficient ? (aggregate?.average_score ?? null) : null,
    confidence: confidenceForSample(sampleSize),
    descriptorCodes: descriptors.results.map((row) => row.descriptor_code),
    minimumSubmittedNotes: 3,
    sampleSize,
    subject: "current_user",
    wouldBuyYesCount: sufficient ? (aggregate?.would_buy_yes_count ?? 0) : null,
  };
}

async function compareSearchResults(
  database: D1Database,
  principal: FirebasePrincipal,
  results: AssistantSearchResult[],
): Promise<AssistantWineComparison[]> {
  if (results.length < 2) return [];
  const comparisons: AssistantWineComparison[] = [];
  for (const result of results.slice(0, 6)) {
    const personal = await database
      .prepare(
        `SELECT COUNT(*) AS sample_size, AVG(note.score_100) AS average_score
        FROM tasting_notes note
        JOIN users actor ON actor.id = note.author_user_id
        JOIN space_memberships membership ON membership.space_id = note.space_id
          AND membership.user_id = actor.id
        WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
          AND membership.status = 'active' AND note.space_id = ? AND note.wine_id = ?
          AND note.state = 'submitted' AND note.deleted_at IS NULL`,
      )
      .bind(principal.firebaseUid, result.spaceId, result.wine.id)
      .first<{ average_score: number | null; sample_size: number }>();
    const sampleSize = personal?.sample_size ?? 0;
    comparisons.push({
      factual: {
        noteCount: result.wine.noteCount,
        region: result.wine.region,
        score100: result.wine.score100,
        vintageYear: result.wine.vintageYear,
        wineType: result.wine.wineType,
      },
      personal: {
        averageScore: sampleSize >= 3 ? (personal?.average_score ?? null) : null,
        confidence: confidenceForSample(sampleSize),
        sampleSize,
      },
      spaceId: result.spaceId,
      wineId: result.wine.id,
      wineName: result.wine.displayName,
    });
  }
  return comparisons;
}

async function findStoredPrices(
  database: D1Database,
  principal: FirebasePrincipal,
  results: AssistantSearchResult[],
): Promise<PriceObservation[]> {
  const observations: PriceObservation[] = [];
  for (const result of results.slice(0, 6)) {
    const response = await listPriceObservations(database, {
      freshnessDays: 90,
      principal,
      spaceId: result.spaceId,
      wineId: result.wine.id,
    });
    observations.push(...(response?.data.observations.slice(0, 5) ?? []));
  }
  return observations
    .sort(
      (left, right) =>
        right.observedAt.localeCompare(left.observedAt) || left.id.localeCompare(right.id),
    )
    .slice(0, 25);
}

async function buildRecommendations(
  database: D1Database,
  principal: FirebasePrincipal,
  results: AssistantSearchResult[],
): Promise<AssistantRecommendation[]> {
  const ranked: Array<AssistantRecommendation & { deterministicScore: number }> = [];
  for (const result of results.slice(0, 12)) {
    const aggregate = await database
      .prepare(
        `SELECT COUNT(*) AS sample_size, AVG(note.score_100) AS average_score,
          SUM(CASE WHEN note.would_buy = 'yes' THEN 1 ELSE 0 END) AS would_buy_yes_count
        FROM tasting_notes note
        JOIN users actor ON actor.id = note.author_user_id
        JOIN space_memberships membership ON membership.space_id = note.space_id
          AND membership.user_id = actor.id
        WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
          AND membership.status = 'active' AND note.space_id = ? AND note.wine_id = ?
          AND note.state = 'submitted' AND note.deleted_at IS NULL`,
      )
      .bind(principal.firebaseUid, result.spaceId, result.wine.id)
      .first<{
        average_score: number | null;
        sample_size: number;
        would_buy_yes_count: number | null;
      }>();
    const sampleSize = aggregate?.sample_size ?? 0;
    const averageScore = sampleSize >= 3 ? (aggregate?.average_score ?? null) : null;
    const wouldBuyYesCount = sampleSize >= 3 ? (aggregate?.would_buy_yes_count ?? 0) : 0;
    const prices = await listPriceObservations(database, {
      freshnessDays: 90,
      principal,
      spaceId: result.spaceId,
      wineId: result.wine.id,
    });
    const latestPrice = prices?.data.observations[0] ?? null;
    const reasonCodes: AssistantRecommendation["reasonCodes"] = [];
    if (sampleSize < 3) reasonCodes.push("limited_history");
    if (averageScore !== null && averageScore >= 85) reasonCodes.push("personal_high_score");
    if (wouldBuyYesCount > 0) reasonCodes.push("would_buy_history");
    if (latestPrice === null) reasonCodes.push("price_unknown");
    else if (!latestPrice.isStale) reasonCodes.push("recent_price");
    const deterministicScore =
      (averageScore ?? 0) * 10 +
      wouldBuyYesCount * 25 +
      (latestPrice !== null && !latestPrice.isStale ? 5 : 0);
    const label: AssistantRecommendation["label"] =
      sampleSize < 3
        ? "insufficient"
        : averageScore !== null && averageScore >= 88 && wouldBuyYesCount > 0
          ? "strong"
          : averageScore !== null && averageScore >= 82
            ? "good"
            : "explore";
    ranked.push({
      averageScore,
      deterministicScore,
      label,
      latestPrice,
      rank: 1,
      reasonCodes: reasonCodes.length === 0 ? ["limited_history"] : reasonCodes,
      sampleSize,
      spaceId: result.spaceId,
      wineId: result.wine.id,
      wineName: result.wine.displayName,
      wouldBuyYesCount,
    });
  }
  return ranked
    .sort(
      (left, right) =>
        right.deterministicScore - left.deterministicScore ||
        left.wineName.localeCompare(right.wineName) ||
        left.wineId.localeCompare(right.wineId),
    )
    .map((recommendation, index) => ({
      averageScore: recommendation.averageScore,
      label: recommendation.label,
      latestPrice: recommendation.latestPrice,
      rank: index + 1,
      reasonCodes: recommendation.reasonCodes,
      sampleSize: recommendation.sampleSize,
      spaceId: recommendation.spaceId,
      wineId: recommendation.wineId,
      wineName: recommendation.wineName,
      wouldBuyYesCount: recommendation.wouldBuyYesCount,
    }));
}

function languageStatements(
  results: AssistantSearchResult[],
  context: AssistantWineContext | null,
  profile: AssistantTasteProfile | null,
  prices: PriceObservation[],
  recommendations: AssistantRecommendation[],
): AssistantLanguageStatement[] {
  const statements: AssistantLanguageStatement[] = results.map((result) => ({
    evidenceClass: "observed",
    id: `wine-${result.wine.id}`,
    sampleSize: result.wine.noteCount,
    sourceIds: [],
    text: [
      result.wine.displayName,
      result.wine.producerName,
      result.wine.vintageYear,
      result.wine.wineType,
      result.wine.region,
      result.wine.score100 === null ? null : `score ${result.wine.score100}`,
    ]
      .filter((value) => value !== null)
      .join("; "),
  }));
  for (const fact of context?.facts ?? []) {
    statements.push({
      evidenceClass: fact.evidenceClass,
      id: `fact-${fact.id}`,
      sampleSize: null,
      sourceIds: fact.citations.map((citation: Fact["citations"][number]) => citation.source.id),
      text: `${fact.predicate}: ${Array.isArray(fact.value) ? fact.value.join(", ") : String(fact.value)}`,
    });
  }
  if (profile !== null && profile.confidence !== "insufficient") {
    statements.push({
      evidenceClass: "personal",
      id: "taste-profile-current-user",
      sampleSize: profile.sampleSize,
      sourceIds: [],
      text: [
        `average submitted score ${profile.averageScore ?? "unavailable"}`,
        `would buy yes ${profile.wouldBuyYesCount ?? "unavailable"}`,
        `top descriptors ${profile.descriptorCodes.join(", ") || "unavailable"}`,
      ].join("; "),
    });
  }
  for (const price of prices.slice(0, 10)) {
    statements.push({
      evidenceClass: "observed",
      id: `price-${price.id}`,
      sampleSize: 1,
      sourceIds: price.sourceId === null ? [] : [price.sourceId],
      text: [
        `price ${price.amountMinor} ${price.currency} minor units`,
        `observed ${price.observedAt}`,
        `source type ${price.sourceType}`,
        price.merchantName,
        `vintage match ${price.vintageMatch}`,
      ]
        .filter((value) => value !== null)
        .join("; "),
    });
  }
  for (const recommendation of recommendations.slice(0, 6)) {
    statements.push({
      evidenceClass: recommendation.sampleSize >= 3 ? "personal" : "inferred",
      id: `recommendation-${recommendation.wineId}`,
      sampleSize: recommendation.sampleSize,
      sourceIds:
        recommendation.latestPrice?.sourceId == null ? [] : [recommendation.latestPrice.sourceId],
      text: `${recommendation.wineName}; qualitative label ${recommendation.label}; reasons ${recommendation.reasonCodes.join(", ")}`,
    });
  }
  return statements.slice(0, 30);
}

export async function runDeterministicAssistantTurn(
  database: D1Database,
  options: {
    aiProvider: "cloudflare" | "none";
    externalResearch: boolean;
    language: AssistantLanguagePort | null;
    principal: FirebasePrincipal;
    request: AssistantTurnRequest;
    requestId: string;
    semanticNotes: SemanticNotePort | null;
    spaceId: string;
  },
): Promise<AssistantTurnResponse | null> {
  const spaces = await allowedSpaces(
    database,
    options.principal,
    options.spaceId,
    options.request.context.allowedCrossSpaceIds,
  );
  if (spaces === null) return null;
  const turnId = ulid();
  let toolCalls = 0;
  const searchStartedAt = Date.now();
  const overview = requestsCollectionOverview(options.request.message);
  const searchResult = await searchMemory(
    database,
    options.principal,
    spaces,
    options.request.message,
    options.request.context.visibleWineId,
    requestsRecommendation(options.request.message) ||
      requestsPrice(options.request.message) ||
      overview,
  );
  const terms = searchResult.terms;
  let results = searchResult.results;
  // A question about the collection as a whole is answered from the whole
  // collection: load it, rank it by the reader's own score, and hand the model
  // a summary statement it can count from — so "how many have I tried?" and
  // "which did I score highest?" are answered with cited facts, not a guess.
  let collectionStatement: AssistantLanguageStatement | null = null;
  if (overview) {
    const collection = await loadCollectionOverview(database, options.principal, spaces);
    if (collection.total > 0) {
      results = collection.wines.slice(0, 20);
      const top = collection.wines
        .filter((entry) => entry.wine.score100 !== null)
        .slice(0, 5)
        .map((entry) => `${entry.wine.displayName} (${entry.wine.score100})`)
        .join("; ");
      collectionStatement = {
        evidenceClass: "observed",
        id: "collection-overview",
        sampleSize: collection.total,
        sourceIds: [],
        text: `collection total ${collection.total} wines; ${collection.scored} scored; top by your score: ${top || "none scored yet"}`,
      };
    }
  }
  // A note matches by meaning, so "mineral wines" finds a note that says fresh
  // and mineral in any language. It rides alongside the term search — the note's
  // wine joins the results, the note itself becomes personal evidence the model
  // can cite. Skipped for a whole-collection question, which already has it all.
  let semanticStatements: AssistantLanguageStatement[] = [];
  if (options.semanticNotes !== null && !overview && terms.length > 0) {
    const semantic = await searchNotesSemantically(
      database,
      options.principal,
      options.semanticNotes,
      options.request.message,
      spaces,
      5,
    );
    if (semantic.results.length > 0) {
      const merged = new Map(
        results.map((result) => [`${result.spaceId}:${result.wine.id}`, result]),
      );
      for (const result of semantic.results) {
        merged.set(`${result.spaceId}:${result.wine.id}`, result);
      }
      results = [...merged.values()].slice(0, 12);
      semanticStatements = semantic.statements;
    }
  }
  await auditToolRun(database, {
    actorId: spaces[0]!.actor_user_id,
    arguments: {
      limit: 10,
      ruleVersion: "deterministic-search-2026.1",
      spaceIds: spaces.map((space) => space.id),
      terms,
      visibleWineId: options.request.context.visibleWineId,
    },
    latencyMs: Math.max(0, Date.now() - searchStartedAt),
    outcome: results.length === 0 ? "not_found" : "ok",
    provider: options.aiProvider,
    resultCount: results.length,
    ruleVersion: "deterministic-search-2026.1",
    spaceId: options.spaceId,
    toolName: "search_memory",
    turnId,
  });
  toolCalls += 1;

  const contextStartedAt = Date.now();
  const visibleContext = await getVisibleWineContext(
    database,
    options.principal,
    results,
    options.request.context.visibleWineId,
  );
  if (options.request.context.visibleWineId !== null) {
    await auditToolRun(database, {
      actorId: spaces[0]!.actor_user_id,
      arguments: {
        sections: ["identity", "tastings", "facts", "sources"],
        spaceId: options.spaceId,
        wineId: options.request.context.visibleWineId,
      },
      citationIds: visibleContext.citations.map((source) => source.id),
      latencyMs: Math.max(0, Date.now() - contextStartedAt),
      outcome: visibleContext.context === null ? "not_found" : "ok",
      provider: options.aiProvider,
      resultCount: visibleContext.context?.facts.length ?? 0,
      ruleVersion: "wine-context-2026.1",
      spaceId: options.spaceId,
      toolName: "get_wine_context",
      turnId,
    });
    toolCalls += 1;
  }

  let tasteProfile: AssistantTasteProfile | null = null;
  if (requestsTasteProfile(options.request.message)) {
    const profileStartedAt = Date.now();
    tasteProfile = await getCurrentUserTasteProfile(database, options.principal, options.spaceId);
    await auditToolRun(database, {
      actorId: spaces[0]!.actor_user_id,
      arguments: {
        minimumSubmittedNotes: 3,
        spaceId: options.spaceId,
        subject: "current_user",
        timeWindow: "all",
      },
      latencyMs: Math.max(0, Date.now() - profileStartedAt),
      outcome: tasteProfile.confidence === "insufficient" ? "insufficient_data" : "ok",
      provider: options.aiProvider,
      resultCount: tasteProfile.sampleSize,
      ruleVersion: "taste-profile-2026.1",
      spaceId: options.spaceId,
      toolName: "get_taste_profile",
      turnId,
    });
    toolCalls += 1;
  }

  let comparisons: AssistantWineComparison[] = [];
  if (requestsComparison(options.request.message)) {
    const comparisonStartedAt = Date.now();
    comparisons = await compareSearchResults(database, options.principal, results);
    await auditToolRun(database, {
      actorId: spaces[0]!.actor_user_id,
      arguments: {
        criteria: ["personal_match", "style"],
        spaceIds: [...new Set(results.slice(0, 6).map((result) => result.spaceId))],
        wineIds: results.slice(0, 6).map((result) => result.wine.id),
      },
      latencyMs: Math.max(0, Date.now() - comparisonStartedAt),
      outcome: comparisons.length < 2 ? "insufficient_data" : "ok",
      provider: options.aiProvider,
      resultCount: comparisons.length,
      ruleVersion: "wine-comparison-2026.1",
      spaceId: options.spaceId,
      toolName: "compare_wines",
      turnId,
    });
    toolCalls += 1;
  }

  let priceObservations: PriceObservation[] = [];
  if (requestsPrice(options.request.message)) {
    const priceStartedAt = Date.now();
    priceObservations = await findStoredPrices(database, options.principal, results);
    await auditToolRun(database, {
      actorId: spaces[0]!.actor_user_id,
      arguments: {
        freshnessDays: 90,
        includeExternal: false,
        spaceIds: [...new Set(results.slice(0, 6).map((result) => result.spaceId))],
        wineIds: results.slice(0, 6).map((result) => result.wine.id),
      },
      latencyMs: Math.max(0, Date.now() - priceStartedAt),
      outcome: priceObservations.length === 0 ? "not_found" : "ok",
      provider: options.aiProvider,
      resultCount: priceObservations.length,
      ruleVersion: "stored-price-observations-2026.1",
      spaceId: options.spaceId,
      toolName: "find_price_observations",
      turnId,
    });
    toolCalls += 1;
  }

  let recommendations: AssistantRecommendation[] = [];
  if (requestsRecommendation(options.request.message)) {
    const recommendationStartedAt = Date.now();
    recommendations = await buildRecommendations(database, options.principal, results);
    await auditToolRun(database, {
      actorId: spaces[0]!.actor_user_id,
      arguments: {
        candidateWineIds: results.slice(0, 12).map((result) => result.wine.id),
        qualitativeOnly: true,
        ruleVersion: "recommendation-2026.1",
        target: "current_user",
      },
      latencyMs: Math.max(0, Date.now() - recommendationStartedAt),
      outcome:
        recommendations.length === 0 ||
        recommendations.every((item) => item.label === "insufficient")
          ? "insufficient_data"
          : "ok",
      provider: options.aiProvider,
      resultCount: recommendations.length,
      ruleVersion: "recommendation-2026.1",
      spaceId: options.spaceId,
      toolName: "build_recommendation",
      turnId,
    });
    toolCalls += 1;
  }

  const noMatches = results.length === 0;
  const evidence: AssistantTurnResponse["data"]["evidence"] = noMatches
    ? []
    : [
        {
          evidenceClass: "observed",
          label: localizedCopy(options.request.locale, "evidence", results.length),
          sampleSize: results.length,
          sourceIds: [],
        },
      ];
  if (tasteProfile !== null && tasteProfile.confidence !== "insufficient") {
    evidence.push({
      evidenceClass: "personal",
      label: localizedPersonalBasis(options.request.locale, tasteProfile.sampleSize),
      sampleSize: tasteProfile.sampleSize,
      sourceIds: [],
    });
  }
  const citationMap = new Map(visibleContext.citations.map((source) => [source.id, source]));
  const priceSourceIds = new Set(
    [...priceObservations, ...recommendations.map((item) => item.latestPrice)]
      .filter((price): price is PriceObservation => price !== null)
      .map((price) => price.sourceId)
      .filter((sourceId): sourceId is string => sourceId !== null),
  );
  for (const sourceId of priceSourceIds) {
    for (const space of spaces) {
      const response = await getSource(database, {
        principal: options.principal,
        sourceId,
        spaceId: space.id,
      });
      if (response !== null) {
        citationMap.set(sourceId, response.data);
        break;
      }
    }
  }
  const languageResult =
    options.language === null
      ? null
      : await options.language.render({
          locale: options.request.locale,
          message: options.request.message,
          statements: [
            ...(collectionStatement === null ? [] : [collectionStatement]),
            ...semanticStatements,
            ...languageStatements(
              results,
              visibleContext.context,
              tasteProfile,
              priceObservations,
              recommendations,
            ),
          ],
        });
  if (languageResult !== null) {
    await database
      .prepare(`UPDATE assistant_tool_runs SET model_version = ? WHERE turn_id = ?`)
      .bind(languageResult.modelVersion, turnId)
      .run();
  }
  const renderedClaims = languageResult?.claims ?? [];
  return {
    data: {
      citations: [...citationMap.values()].slice(0, 8),
      comparisons,
      evidence,
      mode: languageResult === null ? "deterministic" : "provider",
      priceObservations,
      recommendations,
      renderedClaims,
      renderedText:
        languageResult === null
          ? localizedCopy(
              options.request.locale,
              // "AI is off" is only honest when the provider really is off. When
              // it is configured but produced nothing — a failed call, or simply
              // no matching wines to ground on — the fallback must not claim the
              // AI is disabled.
              options.aiProvider === "none"
                ? noMatches
                  ? "not_found"
                  : "found"
                : noMatches
                  ? "not_found_failed"
                  : "found_failed",
              results.length,
            )
          : renderedClaims
              .map((claim) => claim.text)
              .join(" ")
              .slice(0, 2_000),
      results,
      tasteProfile,
      threadId: null,
      toolAvailability: {
        ai:
          options.aiProvider === "none"
            ? "disabled"
            : options.language === null
              ? "unavailable"
              : "available",
        buildRecommendation: "available",
        compareWines: "available",
        createActionDraft: "available",
        externalResearch: options.externalResearch ? "available" : "disabled",
        findPriceObservations: "available",
        getTasteProfile: "available",
        getWineContext: "available",
        researchWine: options.externalResearch ? "available" : "disabled",
        searchMemory: "available",
      },
      turnId,
      usage: {
        externalResearchCalls: 0,
        maxExternalResearchCalls: 2,
        maxToolCalls: 6,
        toolCalls,
      },
      warnings: [
        ...(options.aiProvider === "none" ? (["ai_disabled"] as const) : []),
        "deterministic_search",
        ...(noMatches ? (["no_matches"] as const) : []),
        ...(requestsPrice(options.request.message) ? (["price_coverage_limited"] as const) : []),
        ...(recommendations.length > 0 &&
        recommendations.every((recommendation) => recommendation.label === "insufficient")
          ? (["recommendation_insufficient"] as const)
          : []),
        ...(options.aiProvider === "cloudflare" && languageResult === null
          ? (["provider_unavailable"] as const)
          : []),
      ],
      wineContext: visibleContext.context,
    },
  };
}
