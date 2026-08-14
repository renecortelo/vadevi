import type {
  AssistantSearchResult,
  AssistantTasteProfile,
  AssistantTurnRequest,
  AssistantTurnResponse,
  AssistantWineComparison,
  AssistantWineContext,
  Fact,
  Source,
  SupportedLocale,
  WineSummary,
} from "@vadevi/contracts";
import type { AssistantLanguagePort, AssistantLanguageStatement } from "@vadevi/domain";
import { ulid } from "ulid";

import { sha256Base64Url } from "../security/opaque-token";
import type { FirebasePrincipal } from "../types";
import { listWineFacts } from "./provenance";
import { listWines, normalizeWineText } from "./wine-memory";

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
  kind: "evidence" | "found" | "not_found",
  count: number,
): string {
  const copy: Record<SupportedLocale, Record<typeof kind, string>> = {
    ca: {
      evidence: `${count} registres coincidents de Wine Memory`,
      found: `He trobat ${count} ${count === 1 ? "vi coincident" : "vins coincidents"} a la Wine Memory autoritzada. La IA està desactivada: és una cerca estructurada directa, no una resposta generada.`,
      not_found:
        "No he trobat cap coincidència estructurada a la Wine Memory autoritzada. La IA està desactivada, però el registre i la cerca normals continuen disponibles.",
    },
    de: {
      evidence: `${count} passende Wine-Memory-Einträge`,
      found: `Ich habe ${count} passende ${count === 1 ? "Wein" : "Weine"} im autorisierten Wine Memory gefunden. KI ist deaktiviert: Das ist eine direkte strukturierte Suche, keine generierte Antwort.`,
      not_found:
        "Ich habe im autorisierten Wine Memory keine strukturierte Übereinstimmung gefunden. KI ist deaktiviert, aber Protokollierung und normale Suche bleiben verfügbar.",
    },
    en: {
      evidence: `${count} matching Wine Memory ${count === 1 ? "record" : "records"}`,
      found: `I found ${count} matching ${count === 1 ? "wine" : "wines"} in your authorized Wine Memory. AI is off, so this is a direct structured search—not a generated answer.`,
      not_found:
        "I did not find a structured match in your authorized Wine Memory. AI is off, but logging and ordinary search remain available.",
    },
    es: {
      evidence: `${count} ${count === 1 ? "registro coincidente" : "registros coincidentes"} de Wine Memory`,
      found: `He encontrado ${count} ${count === 1 ? "vino coincidente" : "vinos coincidentes"} en la Wine Memory autorizada. La IA está desactivada: es una búsqueda estructurada directa, no una respuesta generada.`,
      not_found:
        "No he encontrado ninguna coincidencia estructurada en la Wine Memory autorizada. La IA está desactivada, pero el registro y la búsqueda normales siguen disponibles.",
    },
    fr: {
      evidence: `${count} ${count === 1 ? "entrée correspondante" : "entrées correspondantes"} dans Wine Memory`,
      found: `J’ai trouvé ${count} ${count === 1 ? "vin correspondant" : "vins correspondants"} dans la Wine Memory autorisée. L’IA est désactivée : il s’agit d’une recherche structurée directe, pas d’une réponse générée.`,
      not_found:
        "Je n’ai trouvé aucune correspondance structurée dans la Wine Memory autorisée. L’IA est désactivée, mais la saisie et la recherche ordinaires restent disponibles.",
    },
    it: {
      evidence: `${count} ${count === 1 ? "record corrispondente" : "record corrispondenti"} di Wine Memory`,
      found: `Ho trovato ${count} ${count === 1 ? "vino corrispondente" : "vini corrispondenti"} nella Wine Memory autorizzata. L’IA è disattivata: questa è una ricerca strutturata diretta, non una risposta generata.`,
      not_found:
        "Non ho trovato corrispondenze strutturate nella Wine Memory autorizzata. L’IA è disattivata, ma la registrazione e la ricerca normali restano disponibili.",
    },
    nl: {
      evidence: `${count} overeenkomende Wine Memory-${count === 1 ? "vermelding" : "vermeldingen"}`,
      found: `Ik vond ${count} overeenkomende ${count === 1 ? "wijn" : "wijnen"} in het geautoriseerde Wine Memory. AI staat uit: dit is een directe gestructureerde zoekopdracht, geen gegenereerd antwoord.`,
      not_found:
        "Ik vond geen gestructureerde overeenkomst in het geautoriseerde Wine Memory. AI staat uit, maar vastleggen en normaal zoeken blijven beschikbaar.",
    },
    "pt-PT": {
      evidence: `${count} ${count === 1 ? "registo correspondente" : "registos correspondentes"} da Wine Memory`,
      found: `Encontrei ${count} ${count === 1 ? "vinho correspondente" : "vinhos correspondentes"} na Wine Memory autorizada. A IA está desativada: esta é uma pesquisa estruturada direta, não uma resposta gerada.`,
      not_found:
        "Não encontrei correspondências estruturadas na Wine Memory autorizada. A IA está desativada, mas o registo e a pesquisa normais continuam disponíveis.",
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

async function searchMemory(
  database: D1Database,
  principal: FirebasePrincipal,
  spaces: AllowedSpaceRow[],
  message: string,
  visibleWineId: string | null,
): Promise<{ results: AssistantSearchResult[]; terms: string[] }> {
  const terms = searchTerms(message);
  const results = new Map<string, AssistantSearchResult>();
  for (const space of spaces) {
    const queries = terms.length === 0 ? [undefined] : terms;
    for (const query of queries) {
      const response = await listWines(database, {
        limit: 10,
        principal,
        ...(query === undefined ? {} : { query }),
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
    if (visibleWineId !== null && !results.has(`${space.id}:${visibleWineId}`)) {
      const response = await listWines(database, { limit: 100, principal, spaceId: space.id });
      const wine = response?.data.find((candidate: WineSummary) => candidate.id === visibleWineId);
      if (wine !== undefined) {
        results.set(`${space.id}:${wine.id}`, { spaceId: space.id, spaceName: space.name, wine });
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
  "compare_wines" | "get_taste_profile" | "get_wine_context" | "research_wine" | "search_memory";

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

function languageStatements(
  results: AssistantSearchResult[],
  context: AssistantWineContext | null,
  profile: AssistantTasteProfile | null,
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
  const { results, terms } = await searchMemory(
    database,
    options.principal,
    spaces,
    options.request.message,
    options.request.context.visibleWineId,
  );
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
  const languageResult =
    options.language === null
      ? null
      : await options.language.render({
          locale: options.request.locale,
          message: options.request.message,
          statements: languageStatements(results, visibleContext.context, tasteProfile),
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
      citations: visibleContext.citations,
      comparisons,
      evidence,
      mode: languageResult === null ? "deterministic" : "provider",
      renderedClaims,
      renderedText:
        languageResult === null
          ? localizedCopy(options.request.locale, noMatches ? "not_found" : "found", results.length)
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
        compareWines: "available",
        externalResearch: options.externalResearch ? "available" : "disabled",
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
        ...(options.aiProvider === "cloudflare" && languageResult === null
          ? (["provider_unavailable"] as const)
          : []),
      ],
      wineContext: visibleContext.context,
    },
  };
}
