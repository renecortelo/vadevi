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
  WineGrapeSummary,
  WineSummary,
} from "@vadevi/contracts";
import type {
  AssistantLanguagePort,
  AssistantLanguageStatement,
  FoodIdeasPort,
  FoodPairingPort,
  PairingWineStyle,
  SemanticNotePort,
} from "@vadevi/domain";
import { ulid } from "ulid";

import { describeDish, profileDish, recognisedDish } from "../adapters/dish-profile";
import { sha256Base64Url } from "../security/opaque-token";
import type { FirebasePrincipal } from "../types";
import { appellationsForCountry, resolveAppellationCountries } from "./appellation-terms";
import { questionIsUnclear } from "./assistant-question";
import { grapeReferencesFor } from "./grape-reference";
import { listPriceObservations } from "./cellar";
import { resolveCountryCodes } from "./country-terms";
import { resolveGrapeNamesFromMessage } from "./grape-terms";
import { getSource, listWineFacts } from "./provenance";
import { getWineSummary, listWines, normalizeWineText } from "./wine-memory";
import {
  getLibraryGrape,
  getLibraryRegion,
  getLibraryTopic,
  grapesMentionedIn,
  regionsMentionedIn,
  topicsMentionedIn,
} from "./library";
import { jsonList } from "../services/sql-list";

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
      // The words a question is phrased in, which no wine is named after:
      // asking, comparing, tasting, knowing. Left in, "¿cómo se compara mi
      // cata contra lo que sabes…?" searched for "compara" and "sabes".
      "como cómo se lo le les su sus tu tus te me has he ha hay es son está esta este esto eso ese esa sobre contra frente entre compara comparar comparación comparo cata catas catado probado sabes sabe saber dime dame cuéntame cuenta qué cuál cuáles cuánto cuántos uva uvas variedad variedades ficha",
      "com es els seus teu teus has he ha hi són aquest aquesta això sobre contra entre compara comparar comparació tast tasts tastat saps sap digues raïm raïms varietat",
      "how do does did you your yours about against versus compare comparison tasting tasted taste know knows tell grape grapes variety varieties sheet",
      "comment est sont ce cet cette sur contre entre compare comparer comparaison dégustation goûté sais dis cépage cépages",
      "come è sono questo questa su contro tra confronta confronto degustazione assaggiato sai dimmi uva uve vitigno vitigni",
      "como é são este esta isto sobre contra entre compara comparar comparação prova provado sabes diz casta castas",
      "hoe is zijn dit deze over tegen tussen vergelijk vergelijken proeverij geproefd weet druif druiven",
      "wie ist sind dies diese über gegen zwischen vergleich vergleichen verkostung verkostet weißt sag rebsorte rebsorten",
    ].join(" "),
  ).split(" "),
);

function searchTerms(message: string): string[] {
  return [
    ...new Set(
      normalizeWineText(message)
        .split(" ")
        // Three letters at least: a two-letter term ("se") matched inside
        // any name that contains it ("Rosé"), and decided the answer.
        .filter((term) => term.length >= 3 && !/^\d+$/.test(term) && !ignoredTerms.has(term)),
    ),
  ].slice(0, 8);
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

/**
 * A tasting set against a reference rather than against other wines: "how
 * does my tasting compare with what you know of its grapes", "…with what the
 * producer says". Asked about one wine, it is about that wine — not the
 * near matches a comparison between wines would bring along.
 */
function requestsReferenceComparison(message: string): boolean {
  const normalized = normalizeWineText(message);
  const comparing =
    requestsComparison(message) ||
    /\b(contra|frente|coincide|coinciden|encaja|parece|against|matches|match|agree|correspond|correspon|entspricht|corrisponde|klopt)\b/i.test(
      normalized,
    );
  const reference =
    /\b(uva|uvas|raim|raims|grape|grapes|variedad|variedades|varietat|varietats|variety|varieties|cepage|cepages|vitigno|vitigni|rebsorte|rebsorten|druif|druiven|casta|castas|productor|producer|bodega|celler|producteur|produttore|erzeuger|producent|produtor|ficha|oficial|official|tipico|tipica|typical|typique|typisch|tipic|biblioteca|library|sabes|saps|know|teoria|theory)\b/i.test(
      normalized,
    );
  return comparing && reference;
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
  // "What wines do I have?", "my wines", "list my wines": the collection as a
  // whole, asked for by owning or listing rather than by counting.
  if (
    /\b(que vinos tengo|que vinos hay|mis vinos|lista de vinos|listado de vinos|quins vins tinc|els meus vins|llista de vins|what wines do i have|which wines do i have|my wines|list my wines|list of wines|quels vins ai je|mes vins|liste de mes vins|che vini ho|i miei vini|elenco dei vini|welke wijnen heb ik|mijn wijnen|lijst van wijnen|welche weine habe ich|meine weine|liste meiner weine|que vinhos tenho|os meus vinhos|lista de vinhos)\b/.test(
      normalized,
    )
  )
    return true;
  return /\b(how many|count|total|totals|highest|best|top|ranking|ranked|most|cuantos|cuantas|total|totales|mejor|mejores|puntuad|top|clasificaci|bodega|cava|celler|probado|probados|catado|catados|combien|meilleur|meilleurs|classement|quanti|quante|migliore|migliori|classifica|hoeveel|beste|meeste|wie viele|beste|meisten|rangliste|quantos|melhor|melhores|classificac)\b/i.test(
    normalized,
  );
}

// Verbs that ask for a pairing, across the eight locales, normalized so accents
// do not matter. Also the words to strip when reducing the message to the dish.
const pairingVerbs = new Set(
  normalizeWineText(
    "pair pairs pairing goes serve maridar marida maridaje marido combina combinar acompana acompanar abbina abbinare abbinamento accompagne accompagner accord accorder passt passen past bij combineren harmoniza harmonizar acompanha acompanhar kombiniert kombinieren",
  ).split(" "),
);

function requestsPairing(message: string): boolean {
  const normalized = normalizeWineText(message);
  return normalized.split(" ").some((token) => pairingVerbs.has(token));
}

/**
 * The dish out of a pairing question: everything left once the pairing verbs and
 * the wine/question words are removed — "which of my wines pair with duck" leaves
 * "duck". The whole message is the fallback, since the provider reads free text.
 */
function dishFromMessage(message: string): string {
  const food = normalizeWineText(message)
    .split(" ")
    .filter((token) => token.length >= 2 && !ignoredTerms.has(token) && !pairingVerbs.has(token));
  const dish = food.join(" ").slice(0, 200).trim();
  return dish.length >= 2 ? dish : normalizeWineText(message).slice(0, 200);
}

// A pairing question often points at a wine by its style rather than its name —
// "what can I pair that cava with?". These terms let such a question narrow to
// the reader's wines of that style, the same way naming a bottle narrows to it.
const wineTypeTerms: [string, NonNullable<WineSummary["wineType"]>][] = [
  ["cava", "sparkling"],
  ["champan", "sparkling"],
  ["champagne", "sparkling"],
  ["prosecco", "sparkling"],
  ["espumoso", "sparkling"],
  ["espumante", "sparkling"],
  ["sparkling", "sparkling"],
  ["cremant", "sparkling"],
  ["tinto", "red"],
  ["red", "red"],
  ["rouge", "red"],
  ["rosso", "red"],
  ["blanco", "white"],
  ["white", "white"],
  ["blanc", "white"],
  ["bianco", "white"],
  ["rosado", "rose"],
  ["rose", "rose"],
  ["rosat", "rose"],
  ["naranja", "orange"],
  ["orange", "orange"],
  ["generoso", "fortified"],
  ["fortified", "fortified"],
  ["jerez", "fortified"],
  ["oporto", "fortified"],
  ["vermut tinto", "vermouth_red"],
  ["vermut rojo", "vermouth_red"],
  ["vermut negro", "vermouth_red"],
  ["red vermouth", "vermouth_red"],
  ["vermut blanco", "vermouth_white"],
  ["white vermouth", "vermouth_white"],
  ["vermut", "vermouth_red"],
  ["vermouth", "vermouth_red"],
  ["vermú", "vermouth_red"],
];

function wineTypeFromMessage(message: string): NonNullable<WineSummary["wineType"]> | null {
  const padded = ` ${normalizeWineText(message)} `;
  for (const [term, type] of wineTypeTerms) {
    if (padded.includes(` ${term} `)) return type;
  }
  return null;
}

function colorToWineType(color: string | null): WineSummary["wineType"] | null {
  switch ((color ?? "").toLowerCase()) {
    case "red":
      return "red";
    case "white":
      return "white";
    case "rose":
    case "rosé":
      return "rose";
    case "sparkling":
      return "sparkling";
    case "fortified":
      return "fortified";
    case "vermouth_red":
      return "vermouth_red";
    case "vermouth_white":
      return "vermouth_white";
    case "orange":
      return "orange";
    default:
      return null;
  }
}

/**
 * How many unopened bottles the reader has of each of these wines.
 *
 * A pairing answer that cannot tell "you have tasted this" from "you have one
 * standing in the cellar" recommends bottles that are not there. One query for
 * the whole set rather than one per wine, because a pairing can match a dozen.
 */
async function ownedBottleCounts(
  database: D1Database,
  wines: ReadonlyArray<{ spaceId: string; wineId: string }>,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (wines.length === 0) return counts;
  const placeholders = wines.map(() => "(?, ?)").join(", ");
  const rows = await database
    .prepare(
      `SELECT space_id, wine_id, COUNT(*) AS owned FROM bottles
      WHERE state = 'owned' AND deleted_at IS NULL
        AND (space_id, wine_id) IN (VALUES ${placeholders})
      GROUP BY space_id, wine_id`,
    )
    .bind(...wines.flatMap((wine) => [wine.spaceId, wine.wineId]))
    .all<{ owned: number; space_id: string; wine_id: string }>();
  for (const row of rows.results ?? []) counts.set(`${row.space_id}:${row.wine_id}`, row.owned);
  return counts;
}

/**
 * The reader's own wines that suit a dish, by the styles the pairing source
 * returned: a wine matches when its type, one of its grapes, or its region lines
 * up with a suggested style. Grounded entirely in the wine's own attributes; the
 * styles only decide what to look for, never add a wine the reader does not own.
 */
function matchCellarToPairing(
  wines: AssistantSearchResult[],
  styles: PairingWineStyle[],
): Array<{ reasons: string[]; result: AssistantSearchResult }> {
  const styleGrapes = new Set(
    styles.flatMap((style) => style.grapes.map((grape) => normalizeWineText(grape))),
  );
  const styleTypes = new Set(
    styles.map((style) => colorToWineType(style.color)).filter((type) => type !== null),
  );
  const styleRegions = styles
    .map((style) => normalizeWineText(style.region ?? ""))
    .filter((region) => region.length >= 3);
  const matched: Array<{ reasons: string[]; result: AssistantSearchResult }> = [];
  for (const result of wines) {
    const reasons: string[] = [];
    if (result.wine.wineType !== null && styleTypes.has(result.wine.wineType)) {
      reasons.push(`type ${result.wine.wineType}`);
    }
    for (const grape of result.wine.grapes) {
      if (styleGrapes.has(normalizeWineText(grape.name))) reasons.push(`grape ${grape.name}`);
    }
    const region = normalizeWineText(result.wine.region ?? "");
    if (
      region.length >= 3 &&
      styleRegions.some((candidate) => candidate.includes(region) || region.includes(candidate))
    ) {
      reasons.push(`region ${result.wine.region}`);
    }
    if (reasons.length > 0) matched.push({ reasons: [...new Set(reasons)], result });
  }
  return matched
    .sort(
      (left, right) =>
        right.reasons.length - left.reasons.length ||
        (right.result.wine.score100 ?? -1) - (left.result.wine.score100 ?? -1),
    )
    .slice(0, 6);
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
  kind:
    | "evidence"
    | "found"
    | "found_capped"
    | "found_failed"
    | "not_found"
    | "not_found_capped"
    | "not_found_empty"
    | "not_found_failed"
    | "unclear",
  count: number,
): string {
  const copy: Record<SupportedLocale, Record<typeof kind, string>> = {
    ca: {
      evidence: `${count} registres coincidents de la Memòria del vi`,
      found: `He trobat ${count} ${count === 1 ? "vi coincident" : "vins coincidents"} a la Memòria del vi autoritzada. La IA està desactivada: és una cerca estructurada directa, no una resposta generada.`,
      found_failed: `He trobat ${count} ${count === 1 ? "vi coincident" : "vins coincidents"} a la Memòria del vi autoritzada. La IA no ha pogut respondre ara mateix: és una cerca estructurada directa.`,
      found_capped: `He trobat ${count} ${count === 1 ? "vi coincident" : "vins coincidents"} a la Memòria del vi autoritzada. Avui ja s’ha arribat al límit diari de respostes de la IA; demà torna. Mentrestant, això és una cerca estructurada directa.`,
      not_found:
        "No he trobat cap coincidència estructurada a la Memòria del vi autoritzada. La IA està desactivada, però el registre i la cerca normals continuen disponibles.",
      not_found_capped:
        "No he trobat cap coincidència estructurada a la Memòria del vi autoritzada. Avui ja s’ha arribat al límit diari de respostes de la IA; demà torna. El registre i la cerca normals continuen disponibles.",
      not_found_empty:
        "No he trobat en aquest Espai vins que responguin a aquesta pregunta. Prova amb el nom d’un vi, un celler, un raïm o una regió, o pregunta «quins vins tinc?».",
      not_found_failed:
        "No he trobat cap coincidència estructurada a la Memòria del vi autoritzada. La IA no ha pogut respondre ara mateix; el registre i la cerca normals continuen disponibles.",
      unclear:
        "No t’he entès bé. Pots tornar a formular la pregunta? Per exemple: «Què saps de la garnatxa?» o «Quin vi obro amb una paella?»",
    },
    de: {
      evidence: `${count} passende Einträge im Weingedächtnis`,
      found: `Ich habe ${count} passende ${count === 1 ? "Wein" : "Weine"} im autorisierten Weingedächtnis gefunden. KI ist deaktiviert: Das ist eine direkte strukturierte Suche, keine generierte Antwort.`,
      found_failed: `Ich habe ${count} passende ${count === 1 ? "Wein" : "Weine"} im autorisierten Weingedächtnis gefunden. Die KI konnte gerade nicht antworten: Das ist eine direkte strukturierte Suche.`,
      found_capped: `Ich habe ${count} passende ${count === 1 ? "Wein" : "Weine"} im autorisierten Weingedächtnis gefunden. Das Tageslimit für KI-Antworten ist für heute erreicht; morgen geht es weiter. Bis dahin ist das eine direkte strukturierte Suche.`,
      not_found:
        "Ich habe im autorisierten Weingedächtnis keine strukturierte Übereinstimmung gefunden. KI ist deaktiviert, aber Protokollierung und normale Suche bleiben verfügbar.",
      not_found_capped:
        "Ich habe im autorisierten Weingedächtnis keine strukturierte Übereinstimmung gefunden. Das Tageslimit für KI-Antworten ist für heute erreicht; morgen geht es weiter. Protokollierung und normale Suche bleiben verfügbar.",
      not_found_empty:
        "Ich habe in diesem Bereich keine Weine gefunden, die diese Frage beantworten. Versuchen Sie es mit dem Namen eines Weins, Erzeugers, einer Rebsorte oder Region, oder fragen Sie „Welche Weine habe ich?“.",
      not_found_failed:
        "Ich habe im autorisierten Weingedächtnis keine strukturierte Übereinstimmung gefunden. Die KI konnte gerade nicht antworten; Protokollierung und normale Suche bleiben verfügbar.",
      unclear:
        "Das habe ich nicht ganz verstanden. Können Sie Ihre Frage anders formulieren? Zum Beispiel: „Was weißt du über Grenache?“ oder „Welchen Wein öffne ich zu Paella?“",
    },
    en: {
      evidence: `${count} matching Wine Memory ${count === 1 ? "record" : "records"}`,
      found: `I found ${count} matching ${count === 1 ? "wine" : "wines"} in your authorized Wine Memory. AI is off, so this is a direct structured search—not a generated answer.`,
      found_failed: `I found ${count} matching ${count === 1 ? "wine" : "wines"} in your authorized Wine Memory. The AI could not answer just now, so this is a direct structured search.`,
      found_capped: `I found ${count} matching ${count === 1 ? "wine" : "wines"} in your authorized Wine Memory. Today's limit on AI replies has been reached; it is back tomorrow. Until then this is a direct structured search.`,
      not_found:
        "I did not find a structured match in your authorized Wine Memory. AI is off, but logging and ordinary search remain available.",
      not_found_capped:
        "I did not find a structured match in your authorized Wine Memory. Today's limit on AI replies has been reached; it is back tomorrow. Logging and ordinary search remain available.",
      not_found_empty:
        "I found no wines in this Space that answer that question. Try a wine, producer, grape or region by name, or ask “what wines do I have?”.",
      not_found_failed:
        "I did not find a structured match in your authorized Wine Memory. The AI could not answer just now; logging and ordinary search remain available.",
      unclear:
        "I didn’t quite understand that. Could you rephrase your question? For example: “What do you know about Garnacha?” or “Which wine should I open with paella?”",
    },
    es: {
      evidence: `${count} ${count === 1 ? "registro coincidente" : "registros coincidentes"} de la Memoria del vino`,
      found: `He encontrado ${count} ${count === 1 ? "vino coincidente" : "vinos coincidentes"} en la Memoria del vino autorizada. La IA está desactivada: es una búsqueda estructurada directa, no una respuesta generada.`,
      found_failed: `He encontrado ${count} ${count === 1 ? "vino coincidente" : "vinos coincidentes"} en la Memoria del vino autorizada. La IA no pudo responder ahora mismo: es una búsqueda estructurada directa.`,
      found_capped: `He encontrado ${count} ${count === 1 ? "vino coincidente" : "vinos coincidentes"} en la Memoria del vino autorizada. Hoy ya se ha llegado al límite diario de respuestas de la IA; mañana vuelve. Mientras tanto, esto es una búsqueda estructurada directa.`,
      not_found:
        "No he encontrado ninguna coincidencia estructurada en la Memoria del vino autorizada. La IA está desactivada, pero el registro y la búsqueda normales siguen disponibles.",
      not_found_capped:
        "No he encontrado ninguna coincidencia estructurada en la Memoria del vino autorizada. Hoy ya se ha llegado al límite diario de respuestas de la IA; mañana vuelve. El registro y la búsqueda normales siguen disponibles.",
      not_found_empty:
        "No he encontrado en este Espacio vinos que respondan a esa pregunta. Prueba con el nombre de un vino, una bodega, una uva o una región, o pregunta «¿qué vinos tengo?».",
      not_found_failed:
        "No he encontrado ninguna coincidencia estructurada en la Memoria del vino autorizada. La IA no pudo responder ahora mismo; el registro y la búsqueda normales siguen disponibles.",
      unclear:
        "No te he entendido bien. ¿Puedes reformular la pregunta? Por ejemplo: «¿Qué sabes de la garnacha?» o «¿Qué vino abro con una paella?»",
    },
    fr: {
      evidence: `${count} ${count === 1 ? "entrée correspondante" : "entrées correspondantes"} dans la Mémoire du vin`,
      found: `J’ai trouvé ${count} ${count === 1 ? "vin correspondant" : "vins correspondants"} dans la Mémoire du vin autorisée. L’IA est désactivée : il s’agit d’une recherche structurée directe, pas d’une réponse générée.`,
      found_failed: `J’ai trouvé ${count} ${count === 1 ? "vin correspondant" : "vins correspondants"} dans la Mémoire du vin autorisée. L’IA n’a pas pu répondre à l’instant : il s’agit d’une recherche structurée directe.`,
      found_capped: `J’ai trouvé ${count} ${count === 1 ? "vin correspondant" : "vins correspondants"} dans la Mémoire du vin autorisée. La limite quotidienne de réponses de l’IA est atteinte pour aujourd’hui ; elle revient demain. D’ici là, il s’agit d’une recherche structurée directe.`,
      not_found:
        "Je n’ai trouvé aucune correspondance structurée dans la Mémoire du vin autorisée. L’IA est désactivée, mais la saisie et la recherche ordinaires restent disponibles.",
      not_found_capped:
        "Je n’ai trouvé aucune correspondance structurée dans la Mémoire du vin autorisée. La limite quotidienne de réponses de l’IA est atteinte pour aujourd’hui ; elle revient demain. La saisie et la recherche ordinaires restent disponibles.",
      not_found_empty:
        "Je n’ai trouvé dans cet Espace aucun vin qui réponde à cette question. Essayez le nom d’un vin, d’un domaine, d’un cépage ou d’une région, ou demandez « quels vins ai-je ? ».",
      not_found_failed:
        "Je n’ai trouvé aucune correspondance structurée dans la Mémoire du vin autorisée. L’IA n’a pas pu répondre à l’instant ; la saisie et la recherche ordinaires restent disponibles.",
      unclear:
        "Je n’ai pas bien compris. Pouvez-vous reformuler votre question ? Par exemple : « Que sais-tu du grenache ? » ou « Quel vin ouvrir avec une paella ? »",
    },
    it: {
      evidence: `${count} ${count === 1 ? "record corrispondente" : "record corrispondenti"} della Memoria del vino`,
      found: `Ho trovato ${count} ${count === 1 ? "vino corrispondente" : "vini corrispondenti"} nella Memoria del vino autorizzata. L’IA è disattivata: questa è una ricerca strutturata diretta, non una risposta generata.`,
      found_failed: `Ho trovato ${count} ${count === 1 ? "vino corrispondente" : "vini corrispondenti"} nella Memoria del vino autorizzata. L’IA non ha potuto rispondere ora: questa è una ricerca strutturata diretta.`,
      found_capped: `Ho trovato ${count} ${count === 1 ? "vino corrispondente" : "vini corrispondenti"} nella Memoria del vino autorizzata. Il limite giornaliero di risposte dell’IA è stato raggiunto per oggi; torna domani. Nel frattempo questa è una ricerca strutturata diretta.`,
      not_found:
        "Non ho trovato corrispondenze strutturate nella Memoria del vino autorizzata. L’IA è disattivata, ma la registrazione e la ricerca normali restano disponibili.",
      not_found_capped:
        "Non ho trovato corrispondenze strutturate nella Memoria del vino autorizzata. Il limite giornaliero di risposte dell’IA è stato raggiunto per oggi; torna domani. La registrazione e la ricerca normali restano disponibili.",
      not_found_empty:
        "Non ho trovato in questo Spazio vini che rispondano a questa domanda. Prova con il nome di un vino, un produttore, un vitigno o una regione, oppure chiedi «che vini ho?».",
      not_found_failed:
        "Non ho trovato corrispondenze strutturate nella Memoria del vino autorizzata. L’IA non ha potuto rispondere ora; la registrazione e la ricerca normali restano disponibili.",
      unclear:
        "Non ho capito bene. Puoi riformulare la domanda? Per esempio: «Cosa sai del grenache?» o «Che vino apro con una paella?»",
    },
    nl: {
      evidence: `${count} overeenkomende ${count === 1 ? "vermelding" : "vermeldingen"} in het Wijngeheugen`,
      found: `Ik vond ${count} overeenkomende ${count === 1 ? "wijn" : "wijnen"} in het geautoriseerde Wijngeheugen. AI staat uit: dit is een directe gestructureerde zoekopdracht, geen gegenereerd antwoord.`,
      found_failed: `Ik vond ${count} overeenkomende ${count === 1 ? "wijn" : "wijnen"} in het geautoriseerde Wijngeheugen. De AI kon nu geen antwoord geven: dit is een directe gestructureerde zoekopdracht.`,
      found_capped: `Ik vond ${count} overeenkomende ${count === 1 ? "wijn" : "wijnen"} in het geautoriseerde Wijngeheugen. De daglimiet voor AI-antwoorden is voor vandaag bereikt; morgen is die er weer. Tot dan is dit een directe gestructureerde zoekopdracht.`,
      not_found:
        "Ik vond geen gestructureerde overeenkomst in het geautoriseerde Wijngeheugen. AI staat uit, maar vastleggen en normaal zoeken blijven beschikbaar.",
      not_found_capped:
        "Ik vond geen gestructureerde overeenkomst in het geautoriseerde Wijngeheugen. De daglimiet voor AI-antwoorden is voor vandaag bereikt; morgen is die er weer. Vastleggen en normaal zoeken blijven beschikbaar.",
      not_found_empty:
        "Ik vond in deze Ruimte geen wijnen die op die vraag antwoorden. Probeer de naam van een wijn, producent, druif of streek, of vraag ‘welke wijnen heb ik?’.",
      not_found_failed:
        "Ik vond geen gestructureerde overeenkomst in het geautoriseerde Wijngeheugen. De AI kon nu geen antwoord geven; vastleggen en normaal zoeken blijven beschikbaar.",
      unclear:
        "Dat begreep ik niet helemaal. Kun je je vraag anders stellen? Bijvoorbeeld: ‘Wat weet je over garnacha?’ of ‘Welke wijn open ik bij paella?’",
    },
    "pt-PT": {
      evidence: `${count} ${count === 1 ? "registo correspondente" : "registos correspondentes"} da Memória do vinho`,
      found: `Encontrei ${count} ${count === 1 ? "vinho correspondente" : "vinhos correspondentes"} na Memória do vinho autorizada. A IA está desativada: esta é uma pesquisa estruturada direta, não uma resposta gerada.`,
      found_failed: `Encontrei ${count} ${count === 1 ? "vinho correspondente" : "vinhos correspondentes"} na Memória do vinho autorizada. A IA não conseguiu responder agora: esta é uma pesquisa estruturada direta.`,
      found_capped: `Encontrei ${count} ${count === 1 ? "vinho correspondente" : "vinhos correspondentes"} na Memória do vinho autorizada. O limite diário de respostas da IA foi atingido por hoje; volta amanhã. Até lá, esta é uma pesquisa estruturada direta.`,
      not_found:
        "Não encontrei correspondências estruturadas na Memória do vinho autorizada. A IA está desativada, mas o registo e a pesquisa normais continuam disponíveis.",
      not_found_capped:
        "Não encontrei correspondências estruturadas na Memória do vinho autorizada. O limite diário de respostas da IA foi atingido por hoje; volta amanhã. O registo e a pesquisa normais continuam disponíveis.",
      not_found_empty:
        "Não encontrei neste Espaço vinhos que respondam a essa pergunta. Experimente o nome de um vinho, produtor, casta ou região, ou pergunte «que vinhos tenho?».",
      not_found_failed:
        "Não encontrei correspondências estruturadas na Memória do vinho autorizada. A IA não conseguiu responder agora; o registo e a pesquisa normais continuam disponíveis.",
      unclear:
        "Não percebi bem. Pode reformular a pergunta? Por exemplo: «O que sabes sobre a garnacha?» ou «Que vinho abro com uma paella?»",
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
  const requested = jsonList(requestedIds);
  const result = await database
    .prepare(
      `SELECT actor.id AS actor_user_id, space.id, space.name
      FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
      JOIN spaces space ON space.id = membership.space_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.status = 'active' AND space.deleted_at IS NULL
        AND space.id IN ${requested.sql}`,
    )
    .bind(principal.firebaseUid, requested.bind)
    .all<AllowedSpaceRow>();
  if (!result.results.some((space) => space.id === activeSpaceId)) return null;
  const order = new Map(requestedIds.map((id, index) => [id, index]));
  return result.results.sort((left, right) => order.get(left.id)! - order.get(right.id)!);
}

/**
 * The reader's whole collection across the Spaces they may see, ranked by their
 * own score, with the total and how many are scored. The whole of it: the
 * list is followed page by page to its end (bounded far above any household
 * cellar), so "how many wines do I have" is a count, not a first page
 * presented as one.
 */
const overviewPageLimit = 100;
const overviewMaxPages = 20;

async function loadCollectionOverview(
  database: D1Database,
  principal: FirebasePrincipal,
  spaces: AllowedSpaceRow[],
): Promise<{ scored: number; total: number; wines: AssistantSearchResult[] }> {
  const all = new Map<string, AssistantSearchResult>();
  for (const space of spaces) {
    let cursor: string | undefined;
    for (let page = 0; page < overviewMaxPages; page += 1) {
      const response = await listWines(database, {
        ...(cursor === undefined ? {} : { cursor }),
        limit: overviewPageLimit,
        principal,
        sort: "recent",
        spaceId: space.id,
      });
      for (const wine of response?.data ?? []) {
        all.set(`${space.id}:${wine.id}`, { spaceId: space.id, spaceName: space.name, wine });
      }
      const next = response?.page.nextCursor;
      if (!response?.page.hasMore || next === null || next === undefined) break;
      cursor = next;
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
 * What the wine library says about grapes the question names — "¿a qué huele
 * un Ull de Llebre?" — as statements Vicenç may use. A source's values are
 * `researched`, and every one of them was quoted from its article when the
 * library was built; what the pairing rules suggest is `inferred`, and says
 * so, so the answer never presents a rule of thumb as somebody's finding.
 */
/**
 * A stable resource id for a library card's source, so a claim built on it
 * cites something the response can show — the same id for the same grape on
 * every turn, in the format every other source id has.
 */
async function librarySourceId(grapeId: string): Promise<string> {
  const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`wine-library:${grapeId}`)),
  );
  // The first character of a ULID carries at most three bits.
  let id = crockford[digest[0]! % 8]!;
  for (let index = 1; index < 26; index += 1) id += crockford[digest[index]! % 32]!;
  return id;
}

async function loadLibraryStatements(
  database: D1Database,
  message: string,
  locale: string,
): Promise<{
  grapes: { id: string; name: string }[];
  regions: { id: string; name: string }[];
  topics: { id: string; name: string }[];
  sources: Source[];
  statements: AssistantLanguageStatement[];
}> {
  const ids = (await grapesMentionedIn(database, message)).slice(0, 2);
  const grapes: { id: string; name: string }[] = [];
  const regions: { id: string; name: string }[] = [];
  const topics: { id: string; name: string }[] = [];
  const sources: Source[] = [];
  const statements: AssistantLanguageStatement[] = [];
  const now = new Date().toISOString();
  for (const id of ids) {
    const card = await getLibraryGrape(database, id, locale);
    if (card === null) continue;
    grapes.push({ id: card.id, name: card.name });
    // Each statement cites the article its facts were read from: a card's
    // facts may come from its English article and from the grape's article in
    // its own language (Mencía's aromas are the Spanish one's).
    const mainUrl = card.evidence[0]?.sourceUrl ?? card.summary?.sourceUrl ?? null;
    const sourceIdByUrl = new Map<string, string>();
    const sourceFor = async (url: string): Promise<string> => {
      const known = sourceIdByUrl.get(url);
      if (known !== undefined) return known;
      const id = await librarySourceId(url === mainUrl ? card.id : `${card.id}:${url}`);
      sourceIdByUrl.set(url, id);
      sources.push({
        canonicalUrl: url,
        createdAt: now,
        createdByProvider: "wine-library",
        createdByUserId: null,
        id,
        licenseIdentifier: "CC-BY-SA-4.0",
        publisher: "Wikipedia",
        retrievedAt: now,
        sourceType: "open_dataset",
        title: `${card.name} — Wikipedia`,
        updatedAt: now,
      });
      return id;
    };
    const citing = async (fields: string[]): Promise<string[]> => {
      const urls = [
        ...new Set(
          card.evidence
            .filter((entry) => fields.includes(entry.field))
            .map((entry) => entry.sourceUrl),
        ),
      ];
      const chosen = urls.length > 0 ? urls : mainUrl === null ? [] : [mainUrl];
      return Promise.all(chosen.slice(0, 3).map(sourceFor));
    };
    const about = `wine library, grape ${card.name}`;
    const say = async (
      suffix: string,
      text: string,
      evidenceClass: "inferred" | "researched" = "researched",
      cited: string[] = [],
    ) =>
      statements.push({
        evidenceClass,
        id: `library-${card.id}-${suffix}`,
        sampleSize: null,
        // A researched statement must carry its source; a rule's suggestion has none.
        sourceIds: evidenceClass === "researched" ? cited : [],
        text: `${about}: ${text}`,
      });
    if (card.summary !== null) {
      await say("summary", card.summary.text, "researched", [
        await sourceFor(card.summary.sourceUrl),
      ]);
    }
    const structure = (["acidity", "tannin", "body"] as const)
      .filter((axis) => card[axis] !== null)
      .map((axis) => `${axis} ${card[axis]}`);
    if (card.color !== null || card.originCountryCode !== null || structure.length > 0) {
      await say(
        "profile",
        [
          card.color === null ? null : `${card.color === "red" ? "black" : card.color}-skinned`,
          card.originCountryCode === null ? null : `originally from ${card.originCountryCode}`,
          structure.length === 0 ? null : `its wine typically has ${structure.join(", ")}`,
        ]
          .filter(Boolean)
          .join("; "),
        "researched",
        await citing(["color", "origin", "acidity", "tannin", "body"]),
      );
    }
    if (card.aromas.length > 0) {
      await say(
        "aromas",
        `typical aromas: ${card.aromas.join(", ")}`,
        "researched",
        await citing(["aromas"]),
      );
    }
    if (card.regions.length > 0) {
      await say(
        "regions",
        `notably grown in: ${card.regions.map((region) => `${region.name}${region.countryCode === null ? "" : ` (${region.countryCode})`}`).join(", ")}`,
        "researched",
        await citing(["regions"]),
      );
    }
    if (card.synonyms.length > 0) {
      await say(
        "names",
        `also known as: ${card.synonyms.slice(0, 8).join(", ")}`,
        "researched",
        await citing(["synonyms"]),
      );
    }
    if (card.pairings.length > 0) {
      await say(
        "pairings",
        `its source says it goes with: ${card.pairings.join(", ")}`,
        "researched",
        await citing(["pairings"]),
      );
    }
    if (card.suggestedPairings !== null) {
      // Per style: a sweet Riesling's dishes are not a dry one's.
      await say(
        "suggested",
        `the app's pairing rules, which cite open sources, suggest: ${card.suggestedPairings.groups
          .map(
            (group) =>
              `for ${group.style.replaceAll("_", " ")} wines, ${group.families
                .map((family) => family.replaceAll("_", " "))
                .join(", ")}`,
          )
          .join("; ")}`,
        "inferred",
      );
    }
  }
  // Registered wine names the question names: what the EU register says,
  // cited to it, and the grapes their own articles place there.
  for (const regionId of await regionsMentionedIn(database, message)) {
    const region = await getLibraryRegion(database, regionId, locale);
    if (region === null || region.legalUrl === null) continue;
    const registerId = await librarySourceId(`region:${region.id}`);
    sources.push({
      canonicalUrl: region.legalUrl,
      createdAt: now,
      createdByProvider: "wine-library",
      createdByUserId: null,
      id: registerId,
      licenseIdentifier: "EC-reuse-2011-833",
      publisher: "European Commission (eAmbrosia)",
      retrievedAt: now,
      sourceType: "regulator",
      title: `${region.name} — eAmbrosia`,
      updatedAt: now,
    });
    const about = `wine library, registered wine name ${region.name}`;
    const say = (suffix: string, text: string, sourceIds: string[]) =>
      statements.push({
        evidenceClass: "researched",
        id: `library-region-${region.id}-${suffix}`,
        sampleSize: null,
        sourceIds,
        text: `${about}: ${text}`,
      });
    say(
      "register",
      `a ${region.giType === "PDO" ? "protected designation of origin (PDO)" : "protected geographical indication (PGI)"} of ${region.countryCode}${region.registeredOn === null ? "" : `, registered on ${region.registeredOn}`}`,
      [registerId],
    );
    if (region.summary !== null) {
      const summaryId = await librarySourceId(`region-summary:${region.id}`);
      sources.push({
        canonicalUrl: region.summary.sourceUrl,
        createdAt: now,
        createdByProvider: "wine-library",
        createdByUserId: null,
        id: summaryId,
        licenseIdentifier: "CC-BY-SA-4.0",
        publisher: "Wikipedia",
        retrievedAt: now,
        sourceType: "open_dataset",
        title: `${region.name} — Wikipedia`,
        updatedAt: now,
      });
      say("summary", region.summary.text, [summaryId]);
    }
    if (region.grapes.length > 0) {
      // Each grape cited to its own article, listed so the citation resolves.
      const grapeSources = await Promise.all(
        region.grapes.slice(0, 6).map(async (grape) => {
          const id = await librarySourceId(grape.id);
          if (!sources.some((source) => source.id === id)) {
            sources.push({
              canonicalUrl: grape.sourceUrl,
              createdAt: now,
              createdByProvider: "wine-library",
              createdByUserId: null,
              id,
              licenseIdentifier: "CC-BY-SA-4.0",
              publisher: "Wikipedia",
              retrievedAt: now,
              sourceType: "open_dataset",
              title: `${grape.name} — Wikipedia`,
              updatedAt: now,
            });
          }
          return id;
        }),
      );
      say(
        "grapes",
        `grapes whose own articles say they are grown there: ${region.grapes.map((grape) => grape.name).join(", ")}`,
        grapeSources,
      );
    }
    regions.push({ id: region.id, name: region.name });
  }
  // Styles and methods — "¿qué es un vino natural?", "la maloláctica" — from
  // their explanation, cited to its article.
  for (const topicId of await topicsMentionedIn(database, message)) {
    const topic = await getLibraryTopic(database, topicId, locale);
    if (topic?.summary == null) continue;
    const id = await librarySourceId(`topic:${topic.id}`);
    sources.push({
      canonicalUrl: topic.summary.sourceUrl,
      createdAt: now,
      createdByProvider: "wine-library",
      createdByUserId: null,
      id,
      licenseIdentifier: "CC-BY-SA-4.0",
      publisher: "Wikipedia",
      retrievedAt: now,
      sourceType: "open_dataset",
      title: `${topic.name} — Wikipedia`,
      updatedAt: now,
    });
    statements.push({
      evidenceClass: "researched",
      id: `library-topic-${topic.id}`,
      sampleSize: null,
      sourceIds: [id],
      text: `wine library, ${topic.name}: ${topic.summary.text}`,
    });
    topics.push({ id: topic.id, name: topic.name });
  }
  return { grapes, regions, sources, statements, topics };
}

/**
 * The reader's own notes that match the question by meaning, and the wines they
 * belong to. The vector index returns note ids; the text and the wine are read
 * back from the database behind the same membership check AND the author
 * check, so a note is only ever surfaced as the reader's own personal evidence,
 * cited to their note. The author check is the one that keeps a co-member's
 * note in a shared Space — indexed like any other, and as close in meaning —
 * from being read to the wrong person as "your note".
 */
async function searchNotesSemantically(
  database: D1Database,
  principal: FirebasePrincipal,
  port: SemanticNotePort,
  message: string,
  spaces: AllowedSpaceRow[],
  limit: number,
): Promise<{
  results: AssistantSearchResult[];
  statements: AssistantLanguageStatement[];
  // Which wine each statement is about, so a pairing question narrowed to one
  // bottle can drop a semantically-similar note that belongs to a different wine.
  statementWineId: Map<string, string>;
}> {
  const spaceIds = spaces.map((space) => space.id);
  const readerId = spaces[0]?.actor_user_id;
  if (readerId === undefined) return { results: [], statements: [], statementWineId: new Map() };
  const matches = await port.search({ authorUserId: readerId, limit, query: message, spaceIds });
  if (matches.length === 0) return { results: [], statements: [], statementWineId: new Map() };
  const wantedNotes = jsonList(matches.map((match) => match.noteId));
  const wantedSpaces = jsonList(spaceIds);
  const notes = await database
    .prepare(
      `SELECT note.id, note.comment, note.space_id, note.wine_id
        FROM tasting_notes note
        WHERE note.id IN ${wantedNotes.sql} AND note.space_id IN ${wantedSpaces.sql}
          AND note.author_user_id = ? AND note.state = 'submitted'
          AND note.deleted_at IS NULL AND note.comment IS NOT NULL AND note.comment <> ''`,
    )
    .bind(wantedNotes.bind, wantedSpaces.bind, readerId)
    .all<{ comment: string; id: string; space_id: string; wine_id: string }>();
  const spaceById = new Map(spaces.map((space) => [space.id, space]));
  const results = new Map<string, AssistantSearchResult>();
  const statements: AssistantLanguageStatement[] = [];
  const statementWineId = new Map<string, string>();
  for (const note of notes.results) {
    const wine = await getWineSummary(database, principal, note.space_id, note.wine_id);
    if (wine === null) continue;
    const space = spaceById.get(note.space_id);
    results.set(`${note.space_id}:${wine.id}`, {
      spaceId: note.space_id,
      spaceName: space?.name ?? "",
      wine,
    });
    const statementId = `note-${note.id}`;
    statements.push({
      evidenceClass: "personal",
      id: statementId,
      sampleSize: null,
      sourceIds: [],
      text: `your note on ${wine.displayName}: ${note.comment}`,
    });
    statementWineId.set(statementId, wine.id);
  }
  return { results: [...results.values()], statements, statementWineId };
}

type TastingNoteDetailRow = {
  acidity: number | null;
  appearance_text: string | null;
  author_name: string | null;
  body: number | null;
  comment: string | null;
  conclusion_text: string | null;
  nose_swirled_text: string | null;
  nose_text: string | null;
  finish_length: number | null;
  food_text: string | null;
  id: string;
  palate_text: string | null;
  palate_texture: string | null;
  score_100: number | null;
  sweetness: number | null;
  tannin_level: number | null;
  tannin_texture: string | null;
  is_self: number;
  wine_id: string;
  would_buy: string | null;
  would_drink_again: string | null;
};

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * The readable descriptor labels the reader picked, per note and phase — "lemon,
 * green apple" for the nose, "oak, vanilla" for the palate. Uses label_snapshot,
 * the human label saved at tasting time, so no code or ontology lookup is needed.
 */
async function loadNoteDescriptors(
  database: D1Database,
  noteIds: string[],
): Promise<Map<string, { nose: string[]; palate: string[] }>> {
  const byNote = new Map<string, { nose: string[]; palate: string[] }>();
  if (noteIds.length === 0) return byNote;
  const wanted = jsonList(noteIds);
  const rows = await database
    .prepare(
      `SELECT tasting_note_id, phase, label_snapshot FROM tasting_descriptors
        WHERE tasting_note_id IN ${wanted.sql} ORDER BY phase`,
    )
    .bind(wanted.bind)
    .all<{ label_snapshot: string; phase: string; tasting_note_id: string }>();
  for (const row of rows.results) {
    const label = row.label_snapshot.trim();
    if (label.length === 0) continue;
    const entry = byNote.get(row.tasting_note_id) ?? { nose: [], palate: [] };
    if (row.phase === "nose" && entry.nose.length < 8) entry.nose.push(label);
    else if (row.phase === "palate" && entry.palate.length < 8) entry.palate.push(label);
    byNote.set(row.tasting_note_id, entry);
  }
  return byNote;
}

/**
 * The tasting notes for the wines in hand, across the group.
 *
 * Everyone who shares a Space sees each other's SCORES and structured tasting —
 * the rating, the verdicts, the acidity/tannin/body, the descriptors — so Vicenç
 * can average them or compare them by person ("you rated it 88, Ana 92"). What
 * stays private is the free text: each member's own written notes are theirs, so
 * another member's comment and prose sections never travel. The reader's own note
 * still carries its full text. One note per member per wine, bounded overall.
 */
async function loadReaderTastingNotes(
  database: D1Database,
  principal: FirebasePrincipal,
  results: AssistantSearchResult[],
  limit = 6,
): Promise<AssistantLanguageStatement[]> {
  const top = results.slice(0, limit);
  if (top.length === 0) return [];
  const wineById = new Map(top.map((result) => [result.wine.id, result.wine]));
  const wineIds = [...wineById.keys()];
  const wanted = jsonList(wineIds);
  const rows = await database
    .prepare(
      `SELECT note.id, note.wine_id, note.score_100, note.would_buy, note.would_drink_again,
        note.comment, note.sweetness, note.acidity, note.tannin_level,
        note.tannin_texture, note.body, note.palate_texture, note.finish_length, note.palate_text,
        note.appearance_text, note.nose_text, note.nose_swirled_text, note.conclusion_text,
        ctx.food_text, author.display_name AS author_name,
        CASE WHEN author.firebase_uid = ? THEN 1 ELSE 0 END AS is_self
      FROM tasting_notes note
      JOIN users author ON author.id = note.author_user_id AND author.deleted_at IS NULL
      JOIN space_memberships author_member ON author_member.space_id = note.space_id
        AND author_member.user_id = author.id AND author_member.status = 'active'
      -- The reader must actively belong to the note's Space to see it at all.
      JOIN space_memberships reader_member ON reader_member.space_id = note.space_id
        AND reader_member.status = 'active'
      JOIN users reader ON reader.id = reader_member.user_id
        AND reader.firebase_uid = ? AND reader.deleted_at IS NULL
      LEFT JOIN tasting_contexts ctx ON ctx.tasting_note_id = note.id
      WHERE note.wine_id IN ${wanted.sql} AND note.state = 'submitted' AND note.deleted_at IS NULL
      ORDER BY (CASE WHEN author.firebase_uid = ? THEN 0 ELSE 1 END), note.tasted_at DESC
      LIMIT 24`,
    )
    .bind(principal.firebaseUid, principal.firebaseUid, wanted.bind, principal.firebaseUid)
    .all<TastingNoteDetailRow>();
  // The notes that will become statements, capped to two per wine.
  const kept: TastingNoteDetailRow[] = [];
  const seenWineAuthor = new Set<string>();
  for (const row of rows.results) {
    if (!wineById.has(row.wine_id)) continue;
    // The most recent note each member wrote for a wine, so several people show
    // without one prolific taster crowding out the rest.
    const key = `${row.wine_id}:${row.author_name ?? ""}:${row.is_self}`;
    if (seenWineAuthor.has(key)) continue;
    seenWineAuthor.add(key);
    kept.push(row);
    if (kept.length >= 12) break;
  }
  const descriptorsByNote = await loadNoteDescriptors(
    database,
    kept.map((row) => row.id),
  );
  const statements: AssistantLanguageStatement[] = [];
  for (const row of kept) {
    const wine = wineById.get(row.wine_id)!;
    const descriptors = descriptorsByNote.get(row.id);
    const self = row.is_self === 1;
    // Who the note belongs to. The reader is "you"; another member is named, so
    // the model attributes each rating to the right person and never speaks a
    // peer's rating in the second person.
    const who = self ? "you" : (row.author_name ?? "a group member");
    const rated = self ? "you rated it" : `${who} rated it`;
    // The scores and structured tasting are shared across the group. The written
    // sections are not: only the reader's own free text is included, so no member
    // ever reads another's prose.
    const parts = [
      row.score_100 === null ? null : `${rated} ${row.score_100}`,
      row.would_buy === null ? null : `${who} would buy: ${row.would_buy}`,
      row.would_drink_again === null ? null : `${who} would drink again: ${row.would_drink_again}`,
      row.acidity === null ? null : `acidity ${row.acidity}/5`,
      row.tannin_level === null
        ? null
        : `tannin ${row.tannin_level}/5${row.tannin_texture === null ? "" : ` (${row.tannin_texture})`}`,
      row.body === null ? null : `body ${row.body}/5`,
      row.sweetness === null ? null : `sweetness ${row.sweetness}/5`,
      row.finish_length === null ? null : `finish ${row.finish_length}/5`,
      row.palate_texture === null ? null : `palate ${row.palate_texture}`,
      descriptors === undefined || descriptors.nose.length === 0
        ? null
        : `aromas ${who} noted: ${descriptors.nose.join(", ")}`,
      descriptors === undefined || descriptors.palate.length === 0
        ? null
        : `flavours ${who} noted: ${descriptors.palate.join(", ")}`,
      !self || row.appearance_text === null || row.appearance_text.length === 0
        ? null
        : `appearance note: ${clip(row.appearance_text, 160)}`,
      !self || row.nose_text === null || row.nose_text.length === 0
        ? null
        : `nose note: ${clip(row.nose_text, 160)}`,
      !self || row.nose_swirled_text === null || row.nose_swirled_text.length === 0
        ? null
        : `nose after swirling: ${clip(row.nose_swirled_text, 160)}`,
      !self || row.palate_text === null || row.palate_text.length === 0
        ? null
        : `palate note: ${clip(row.palate_text, 160)}`,
      !self || row.conclusion_text === null || row.conclusion_text.length === 0
        ? null
        : `your conclusion: ${clip(row.conclusion_text, 200)}`,
      !self || row.food_text === null || row.food_text.length === 0
        ? null
        : `you had it with: ${clip(row.food_text, 120)}`,
      !self || row.comment === null || row.comment.length === 0
        ? null
        : `you wrote: ${clip(row.comment, 200)}`,
    ].filter((part): part is string => part !== null);
    if (parts.length === 0) continue;
    statements.push({
      // The reader's own note is personal; a peer's shared scores are an
      // observation, never the reader's own — so the model does not fold another
      // member's rating into "your" record.
      evidenceClass: self ? "personal" : "observed",
      id: `note-detail-${row.id}`,
      sampleSize: 1,
      sourceIds: [],
      text: self
        ? `your tasting note on ${wine.displayName}: ${parts.join("; ")}`
        : `${who}'s tasting note on ${wine.displayName}: ${parts.join("; ")}`,
    });
  }
  return statements;
}

/** The wine the screen says the reader is looking at, as a search result. */
async function visibleWineResult(
  database: D1Database,
  principal: FirebasePrincipal,
  spaces: { id: string; name: string }[],
  visibleWineId: string | null,
): Promise<AssistantSearchResult | null> {
  if (visibleWineId === null) return null;
  for (const space of spaces) {
    const wine = await getWineSummary(database, principal, space.id, visibleWineId);
    if (wine !== null) return { spaceId: space.id, spaceName: space.name, wine };
  }
  return null;
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
  // A place name the reader typed that the cellar records only as an ISO country
  // code — "México" for a wine filed under MX. Resolved from the whole message
  // so multi-word names ("estados unidos") survive the per-term split. A named
  // appellation ("Rioja") also resolves to its country, so it reaches wines
  // filed under Spain even when worded differently.
  const countryCodes = [
    ...new Set([...resolveCountryCodes(message), ...resolveAppellationCountries(message)]),
  ].slice(0, 3);
  // The appellations of each named country, so naming the country also reaches a
  // wine whose region is one of them but whose country was never recorded — a
  // Parras wine surfaces from "algo de México" even with no country code on it.
  const appellationRegions = [
    ...new Set(countryCodes.flatMap((code) => appellationsForCountry(code))),
  ].slice(0, 8);
  // The grape names to search: every variety named in the question expanded by
  // its known synonyms (so "Tinto Fino" finds a "Tempranillo"), plus the raw
  // terms so an unlisted grape the reader named is still matched by its own name.
  const grapeNames = [...new Set([...resolveGrapeNamesFromMessage(message), ...terms])].slice(0, 8);
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
    // Every wine the reader owns from a country they named, by its stored code.
    for (const countryCode of countryCodes) {
      const response = await listWines(database, {
        countryCode,
        limit: 10,
        principal,
        sort: "recent",
        spaceId: space.id,
      });
      for (const wine of response?.data ?? []) {
        results.set(`${space.id}:${wine.id}`, { spaceId: space.id, spaceName: space.name, wine });
      }
    }
    // …and by the region text of that country's appellations, for wines whose
    // country was never recorded but whose region names the place.
    for (const region of appellationRegions) {
      const response = await listWines(database, {
        limit: 10,
        principal,
        region,
        sort: "recent",
        spaceId: space.id,
      });
      for (const wine of response?.data ?? []) {
        results.set(`${space.id}:${wine.id}`, { spaceId: space.id, spaceName: space.name, wine });
      }
    }
    // …and by grape, synonyms included, so a variety the reader named reaches
    // their wines made from it however that grape was written down.
    for (const grape of grapeNames) {
      const response = await listWines(database, {
        grape,
        limit: 10,
        principal,
        sort: "recent",
        spaceId: space.id,
      });
      for (const wine of response?.data ?? []) {
        results.set(`${space.id}:${wine.id}`, { spaceId: space.id, spaceName: space.name, wine });
      }
    }
  }
  // Whether the question found wines on its own terms. A fresh subject does; a
  // pronoun follow-up ("…and pair it?") finds nothing, and leans on the wine
  // carried from before instead.
  const foundOwnMatches = results.size > 0;
  // The carried wine resolves that follow-up — but ONLY when the question found
  // nothing itself. Forcing it in, and to the front, on every turn is what made a
  // conversation cling to one bottle: a later "¿hay un vino de Marlborough?" kept
  // answering about the wine from three turns ago and showed its facts.
  if (visibleWineId !== null && !foundOwnMatches) {
    for (const space of spaces) {
      if (results.has(`${space.id}:${visibleWineId}`)) continue;
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
  // The best match first: a wine whose whole name the question spells out,
  // then the wine matching more of its terms. Results used to keep the order
  // the passes found them in, so a wine matching one stray word could lead.
  const spelled = ` ${normalizeWineText(message)} `;
  const relevance = (result: AssistantSearchResult) => {
    const name = normalizeWineText(result.wine.displayName);
    const text = normalizeWineText(
      [result.wine.displayName, result.wine.producerName ?? "", result.wine.region ?? ""].join(" "),
    );
    return (
      (name.length >= 3 && spelled.includes(` ${name} `) ? 100 : 0) +
      terms.filter((term) => text.includes(term)).length
    );
  };
  const ordered = [...results.values()].sort((left, right) => {
    // Bring the carried wine to the front only when it IS the subject — the
    // follow-up case where the question found nothing of its own. On a fresh
    // subject the genuine top match must lead, not the wine held from before.
    if (visibleWineId !== null && !foundOwnMatches) {
      return Number(right.wine.id === visibleWineId) - Number(left.wine.id === visibleWineId);
    }
    return relevance(right) - relevance(left);
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
  // A discarded (retired) fact must never reach Vicenç — the reader threw it out,
  // so the assistant should not repeat it as if it were still evidence.
  const liveFacts = response.data.facts.filter((fact: Fact) => fact.status !== "retired");
  const citations = new Map<string, Source>();
  for (const fact of liveFacts) {
    for (const citation of fact.citations) citations.set(citation.source.id, citation.source);
  }
  return {
    citations: [...citations.values()].slice(0, 8),
    context: {
      conflicts: response.data.conflicts.slice(0, 25),
      facts: liveFacts.slice(0, 50),
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
    // How many unopened bottles the reader actually has, so a recommendation to
    // open one is only ever made for a wine they can open — a finished, gifted,
    // or never-stocked wine is one to seek out again, not to reach for tonight.
    const availability = await database
      .prepare(
        `SELECT COUNT(*) AS owned FROM bottles
        WHERE space_id = ? AND wine_id = ? AND state = 'owned' AND deleted_at IS NULL`,
      )
      .bind(result.spaceId, result.wine.id)
      .first<{ owned: number }>();
    const availableBottles = availability?.owned ?? 0;
    const reasonCodes: AssistantRecommendation["reasonCodes"] = [];
    if (availableBottles > 0) reasonCodes.push("in_cellar");
    else reasonCodes.push("not_in_cellar");
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
      availableBottles,
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
      availableBottles: recommendation.availableBottles,
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
  // These predicates already read as a full phrase or "label: value" pair, so the
  // raw predicate name would only add noise; other predicates keep it as a label.
  const selfDescribing = new Set([
    "curiosity.highlight",
    "curiosity.note",
    "pairing.note",
    "research.summary",
    "further_reading.summary",
  ]);
  for (const fact of context?.facts ?? []) {
    const value = Array.isArray(fact.value) ? fact.value.join(", ") : String(fact.value);
    statements.push({
      evidenceClass: fact.evidenceClass,
      id: `fact-${fact.id}`,
      sampleSize: null,
      sourceIds: fact.citations.map((citation: Fact["citations"][number]) => citation.source.id),
      text: selfDescribing.has(fact.predicate) ? value : `${fact.predicate}: ${value}`,
    });
  }
  if (profile !== null && profile.confidence !== "insufficient") {
    statements.push({
      evidenceClass: "personal",
      id: "taste-profile-current-user",
      sampleSize: profile.sampleSize,
      sourceIds: [],
      // The confidence and how many notes back it travel with the profile, so
      // the reader is told how firm it is — "from 4 notes, low confidence" —
      // rather than a bare average that reads more certain than it is.
      text: [
        `taste profile inferred from ${profile.sampleSize} submitted notes`,
        `confidence ${profile.confidence}`,
        `average submitted score ${profile.averageScore ?? "unavailable"}`,
        `would buy yes ${profile.wouldBuyYesCount ?? "unavailable"}`,
        `top descriptors ${profile.descriptorCodes.join(", ") || "unavailable"}`,
      ].join("; "),
    });
  } else if (profile !== null) {
    // Cold start: the profile exists but rests on too few notes to describe.
    // Say so plainly instead of guessing a preference from one or two bottles.
    statements.push({
      evidenceClass: "personal",
      id: "taste-profile-current-user",
      sampleSize: profile.sampleSize,
      sourceIds: [],
      text: `not enough submitted tasting notes yet to infer a taste profile: ${profile.sampleSize} of ${profile.minimumSubmittedNotes} needed. Say there is not enough history yet rather than describing a preference.`,
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
      // A recommendation is a derived suggestion, not a fact the reader recorded,
      // so it is always inferred — the model frames it as advice, never as one of
      // the reader's own entries, however much of their history it rests on. How
      // much history that is still travels in sampleSize.
      evidenceClass: "inferred",
      id: `recommendation-${recommendation.wineId}`,
      sampleSize: recommendation.sampleSize,
      sourceIds:
        recommendation.latestPrice?.sourceId == null ? [] : [recommendation.latestPrice.sourceId],
      text: `${recommendation.wineName}; qualitative label ${recommendation.label}; ${recommendation.availableBottles > 0 ? `${recommendation.availableBottles} unopened bottles in the cellar to open` : "no unopened bottles in the cellar — one to seek out, not to open"}; reasons ${recommendation.reasonCodes.join(", ")}`,
    });
  }
  return statements.slice(0, 30);
}

/** The reply to a question that could not be understood: ask again. */
function unclearTurn(
  options: Parameters<typeof runDeterministicAssistantTurn>[1],
  turnId: string,
): AssistantTurnResponse {
  return {
    data: {
      citations: [],
      comparisons: [],
      evidence: [],
      // The wine in hand stays in hand, so the rephrased question still follows it.
      focusWineId: options.request.context.visibleWineId ?? null,
      libraryGrapes: [],
      libraryRegions: [],
      libraryTopics: [],
      mode: "deterministic",
      priceObservations: [],
      recommendations: [],
      renderedClaims: [],
      renderedText: localizedCopy(options.request.locale, "unclear", 0),
      results: [],
      tasteProfile: null,
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
        toolCalls: 0,
      },
      warnings: ["unclear_question"],
      wineContext: null,
    },
  };
}

export async function runDeterministicAssistantTurn(
  database: D1Database,
  options: {
    /** The reader's or the deployment's daily cap on AI replies is reached, so
     *  this turn runs without the model — and must say so, not "the AI could
     *  not answer", which reads as an outage and sends people looking for one. */
    aiBudgetReached?: boolean;
    aiProvider: "cloudflare" | "none";
    externalResearch: boolean;
    foodIdeas?: FoodIdeasPort | null;
    language: AssistantLanguagePort | null;
    pairing: FoodPairingPort | null;
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
  // A message that asks nothing — "¿qué" sent before the rest was typed — is
  // answered with a request to rephrase: no search, no model, nothing made up.
  if (questionIsUnclear(options.request.message)) {
    return unclearTurn(options, turnId);
  }
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
  // and mineral in any language. It is a fallback for when the term search would
  // MISS a wine — so it runs only when that search found nothing. Letting it ride
  // alongside a search that already answered padded "matching wines" with a
  // note-similar but off-topic bottle — a Rioja surfacing on "¿tengo un vino de
  // Nueva Zelanda?". Skipped too for a whole-collection question, which has it all.
  let semanticStatements: AssistantLanguageStatement[] = [];
  let semanticStatementWineId = new Map<string, string>();
  if (options.semanticNotes !== null && !overview && terms.length > 0 && results.length === 0) {
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
      semanticStatementWineId = semantic.statementWineId;
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

  // "Which of MY wines go with duck?" — the pairing source says what styles suit
  // the dish, and those criteria rank the reader's OWN wines, never a bottle they
  // do not own. The dish leaves the device; the wines never do. Off unless the
  // deployment enabled the provider.
  let pairingStatements: AssistantLanguageStatement[] = [];
  // Sources behind any cited pairing note surfaced below, merged into the turn's
  // citations so the advice shows where it came from.
  const pairingCitationSources: Source[] = [];
  // "What can I pair the Naltros with?" is the OTHER direction — a wine looking
  // for a dish — and the provider only answers dish → wine styles. Sending the
  // wine's own name as if it were a dish produced nonsense (a bottle unrelated to
  // the question), so that path is answered separately, below.
  const askedType = wineTypeFromMessage(options.request.message);
  // The wine the reader spelled out. Kept apart from the other ways a wine is
  // resolved, because naming a bottle outright is the one unambiguous signal that
  // the question is about that bottle and no other.
  const wineNamedInMessage =
    results.find((result) => {
      const name = normalizeWineText(result.wine.displayName);
      return name.length >= 3 && normalizeWineText(options.request.message).includes(name);
    }) ?? null;
  const namedWine =
    wineNamedInMessage ??
    // "…with that cava?" points at a wine by style rather than by name. When the
    // reader owns exactly one wine of that style, the question is about it.
    (askedType === null
      ? null
      : (() => {
          const ofType = results.filter((result) => result.wine.wineType === askedType);
          return ofType.length === 1 ? ofType[0]! : null;
        })()) ??
    // "…and what can I pair IT with?" names nothing at all, so the antecedent has
    // to come from the screen: the wine last surfaced. But ONLY for a pronoun
    // follow-up like this — a pairing question. A fresh subject question ("¿hay un
    // vino de Marlborough?") must not drag the previously focused wine in and
    // answer about it; that made a Marlborough search show a carried wine's facts.
    //
    // And only when the question names no food. "What do I pair a roast chicken
    // with?" is a dish looking for a wine, not the wine on screen looking for a
    // dish — but with a bottle open on the evidence page it was read as the
    // second, the dish pairing below was skipped entirely, and the answer came
    // back about that bottle with nothing but its own narrative to stand on.
    (requestsPairing(options.request.message) &&
    !recognisedDish(profileDish(dishFromMessage(options.request.message)))
      ? (results.find((result) => result.wine.id === options.request.context.visibleWineId) ??
        (await visibleWineResult(
          database,
          options.principal,
          spaces,
          options.request.context.visibleWineId,
        )))
      : null);
  const namesOwnWine = namedWine !== null;
  // The antecedent may not be among the search hits — "pair it with" matches
  // nothing in particular — so once found it joins the results, or the answer
  // would be about a wine the reader never sees listed.
  if (namedWine !== null && !results.some((result) => result.wine.id === namedWine.wine.id)) {
    results = [namedWine, ...results];
  }
  // A pairing question that names one bottle is about THAT bottle. Search also
  // returns near matches, and handing them all to the model made it answer about
  // another wine entirely ("what can I pair the Naltros with?" opening with El
  // Coto). Narrowed to pairing only: comparisons and recommendations legitimately
  // need the other results.
  // Asking about a wine by name is about THAT wine, whatever is being asked. Only
  // three kinds of question legitimately want the others alongside it: comparing
  // wines, asking for a recommendation, and surveying the whole collection. Any
  // other question naming one bottle — "how did I rate the Kiwi Trail?" — was
  // listing every near match as a "matching wine", which reads as though the
  // answer covers them too.
  const comparesWithReference = requestsReferenceComparison(options.request.message);
  const aboutSeveralWines =
    overview ||
    (requestsComparison(options.request.message) && !comparesWithReference) ||
    requestsRecommendation(options.request.message);
  const focusOne = (wine: AssistantSearchResult) => {
    results = [wine];
    // A note surfaced only because it reads similarly — the reader's note on
    // another wine — must not travel with it. It was what put "no hay información
    // sobre EL COTO" into an answer about the Kiwi Trail.
    semanticStatements = semanticStatements.filter(
      (statement) => semanticStatementWineId.get(statement.id) === wine.wine.id,
    );
  };
  if (requestsPairing(options.request.message) && namedWine !== null) {
    focusOne(namedWine);
  } else if (wineNamedInMessage !== null && !aboutSeveralWines) {
    focusOne(wineNamedInMessage);
  } else if (requestsPairing(options.request.message) && askedType !== null) {
    // Several wines of the named style: still better to answer about those than
    // to hand the model the whole cellar as "matching wines".
    const ofType = results.filter((result) => result.wine.wineType === askedType);
    if (ofType.length > 0) results = ofType;
  }
  if (options.pairing !== null && requestsPairing(options.request.message) && !namesOwnWine) {
    const dish = dishFromMessage(options.request.message);
    try {
      const pairing = await options.pairing.pair({ dish, locale: options.request.locale });
      if (pairing.status === "success" && pairing.data.styles.length > 0) {
        const collection = await loadCollectionOverview(database, options.principal, spaces);
        const matches = matchCellarToPairing(collection.wines, pairing.data.styles);
        if (matches.length > 0) {
          const merged = new Map(
            results.map((result) => [`${result.spaceId}:${result.wine.id}`, result]),
          );
          for (const match of matches) {
            merged.set(`${match.result.spaceId}:${match.result.wine.id}`, match.result);
          }
          results = [...merged.values()].slice(0, 12);
        }
        // How many of each matched wine the reader actually has standing in the
        // cellar. "You have tasted this" and "you can open this tonight" are
        // different answers to a pairing question, and running them together
        // recommends a bottle that is not there.
        const owned = await ownedBottleCounts(
          database,
          matches.map((match) => ({ spaceId: match.result.spaceId, wineId: match.result.wine.id })),
        );

        // The general answer first, the reader's own wines second. Three kinds
        // of statement, in the order the answer should be given: what the plate
        // is, what a wine therefore needs, and only then which of their bottles
        // has it. Without the first two the model can only list wines, which is
        // what it did while the criteria statement threw the reasoning away.
        pairingStatements = [
          {
            evidenceClass: "inferred",
            id: "pairing-dish",
            sampleSize: null,
            sourceIds: [],
            text: `the dish "${dish}" is ${describeDish(dish)}`,
          },
          ...pairing.data.styles.map((style: PairingWineStyle, index: number) => ({
            evidenceClass: "inferred" as const,
            id: `pairing-style-${index + 1}`,
            sampleSize: null,
            sourceIds: [],
            // The description is the rule that chose this style — "high acidity
            // to cut the fat". It is the whole point of the answer.
            text:
              `a wine style that suits "${dish}" in general, whether or not the reader owns one: ` +
              `${style.name}${style.grapes.length > 0 ? ` (${style.grapes.join(", ")})` : ""}` +
              `${style.region === null ? "" : `, for example from ${style.region}`}` +
              `${style.description === null || style.description === "" ? "" : ` — it works because it brings ${style.description}`}`,
          })),
          ...matches.map((match) => {
            const bottles = owned.get(`${match.result.spaceId}:${match.result.wine.id}`) ?? 0;
            return {
              evidenceClass: "inferred" as const,
              id: `pairing-${match.result.wine.id}`,
              sampleSize: null,
              sourceIds: [],
              text:
                `among the reader's own wines, ${match.result.wine.displayName} fits those criteria ` +
                `because it matches ${match.reasons.join(", ")}; ` +
                (bottles > 0
                  ? `they have ${bottles} bottle${bottles === 1 ? "" : "s"} of it in the cellar and could open one tonight`
                  : `they have tasted it but own no bottle of it right now, so it is one to seek out rather than to open`),
            };
          }),
        ];
      } else if (pairing.status === "unavailable" && pairing.reason === "not_found") {
        // The dish was not understood. Saying nothing let the turn quietly become
        // "here is a wine from your cellar", which answers a question the reader
        // did not ask and hides that the food was never looked at.
        pairingStatements = [
          {
            evidenceClass: "inferred",
            id: "pairing-unknown-dish",
            sampleSize: null,
            sourceIds: [],
            text:
              `no wine-style criteria could be worked out for "${dish}", because that dish is ` +
              `not in the pairing vocabulary. Say plainly that you do not know this one, then ` +
              `ask a single closed question the reader can answer in one word, offering the ` +
              `choices: is the main thing on the plate red meat, white meat, oily fish, lean ` +
              `fish, shellfish, cheese, vegetables or pulses — and is it grilled, roasted, ` +
              `fried, stewed, or raw? Their answer will be understood. Do not invent criteria ` +
              `and do not answer with a wine instead.`,
          },
        ];
      }
    } catch {
      // A failed pairing lookup just leaves the turn without pairing statements.
    }
    toolCalls += 1;
  }

  // Pairing the reader asked about THIS bottle, gathered from the open web during
  // research and cited: advice written about the wine, or failing that about its
  // grape. Surfaced whenever it is a pairing question about a named wine, provider
  // or not — the notes exist already and are the most grounded pairing there is,
  // so they lead, ahead of any inferred suggestion below. Retired notes are
  // excluded: the reader discarded them.
  const wantsWinePairing = namedWine !== null && requestsPairing(options.request.message);
  const pairingFacts = wantsWinePairing
    ? await listWineFacts(database, {
        principal: options.principal,
        spaceId: namedWine.spaceId,
        wineId: namedWine.wine.id,
      })
    : null;
  if (pairingFacts !== null) {
    const notes = pairingFacts.data.facts.filter(
      (fact: Fact) => fact.status !== "retired" && fact.predicate === "pairing.note",
    );
    pairingStatements = [
      ...notes.slice(0, 4).map((fact: Fact) => ({
        evidenceClass: "researched" as const,
        id: `pairing-${fact.id}`,
        sampleSize: null,
        sourceIds: fact.citations.map((citation: Fact["citations"][number]) => citation.source.id),
        text: String(fact.value),
      })),
      ...pairingStatements,
    ];
    for (const fact of notes) {
      for (const citation of fact.citations) pairingCitationSources.push(citation.source);
    }
  }

  // The reverse question — "what can I eat with THIS bottle?" — answered from the
  // wine's own recorded attributes. These are suggestions, not facts: they carry
  // the inferred class, which the prompt already treats as "my idea, not
  // established", and nothing here asserts anything new about the bottle.
  const foodIdeas = options.foodIdeas ?? null;
  if (foodIdeas !== null && namedWine !== null && requestsPairing(options.request.message)) {
    const wine = namedWine.wine;
    // What the reader recorded, plus what research found about the bottle — the
    // grape's own traits, the gathered notes, the narrative. A wine registered
    // with little detail is exactly the one whose suggestions were generic, and
    // those researched lines are what make them specific. Retired claims are
    // excluded: the reader discarded them, so they cannot inform a suggestion.
    const researchedLines = (pairingFacts?.data.facts ?? [])
      .filter(
        (fact: Fact) =>
          fact.status !== "retired" &&
          (fact.predicate === "curiosity.highlight" ||
            fact.predicate === "curiosity.note" ||
            fact.predicate === "research.summary"),
      )
      .map((fact: Fact) => String(fact.value))
      .slice(0, 8);
    // What the bottle IS, then what the sources say about it — that is the basis
    // for a pairing. The reader's own tasting lines travel separately and are
    // marked as secondary: a pairing built entirely on one impression of one
    // glass is not what someone asking "what goes with this?" wants back.
    const attributes = [
      wine.wineType === null ? null : `type: ${wine.wineType}`,
      wine.grapes.length === 0
        ? null
        : `grapes: ${wine.grapes.map((grape: WineGrapeSummary) => grape.name).join(", ")}`,
      wine.region === null ? null : `region: ${wine.region}`,
      wine.vintageYear === null ? null : `vintage: ${wine.vintageYear}`,
      ...researchedLines,
    ].filter((attribute): attribute is string => attribute !== null && attribute.length > 0);
    // The reader's own tasting lines for this bottle. They are deliberately
    // secondary — the wine's attributes lead — but they are the difference
    // between a generic suggestion and one that answers what THEY tasted.
    //
    // This used to read `namedWine.notes`, a property a search result has never
    // had, so it was always empty and no tasting ever reached a suggestion. The
    // compiler could not say so while the contract types were `any`.
    //
    // Only the reader's own notes: `loadReaderTastingNotes` already withholds a
    // co-member's written text, and the `personal` class is what marks a note as
    // the reader's own, so a peer's words cannot reach the model here either.
    const readerNotes = (await loadReaderTastingNotes(database, options.principal, [namedWine], 1))
      .filter((statement) => statement.evidenceClass === "personal")
      .map((statement) => statement.text)
      .slice(0, 2);
    if (attributes.length > 0 || readerNotes.length > 0) {
      try {
        const ideas = await foodIdeas.suggest({
          attributes,
          locale: options.request.locale,
          notes: readerNotes,
          wine: wine.displayName,
        });
        if (ideas !== null) {
          pairingStatements = [
            ...pairingStatements,
            ...ideas.map((idea, index) => ({
              evidenceClass: "inferred" as const,
              id: `food-idea-${index}`,
              sampleSize: null,
              sourceIds: [],
              // The idea already comes back in the reader's language; an English
              // wrapper here is what taught the model to answer in English.
              text: `${wine.displayName} — ${idea}`,
            })),
          ];
        }
      } catch {
        // A failed suggestion just leaves the turn without dish ideas.
      }
      toolCalls += 1;
    }
  }

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
  for (const source of pairingCitationSources) citationMap.set(source.id, source);
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
  // The reader's own detailed tasting notes for the wines in hand, so Vicenç can
  // answer "what did I say?" or "why did I score it 58?" from their words and
  // ratings. Skipped for a whole-collection question, which is aggregate.
  const noteStatements =
    options.language === null || overview
      ? []
      : await loadReaderTastingNotes(database, options.principal, results);
  const library = await loadLibraryStatements(
    database,
    options.request.message,
    options.request.locale,
  );
  // The grapes of the wine in question, from the library: what each variety
  // is typically like, so a question setting the reader's tasting against
  // "what you know of its grapes" has that side to stand on. Only for the wine
  // in hand — the one named, the only match, or the one a reference
  // comparison is about — so a list of wines is not crowded out by grapes.
  const winesInHand = overview
    ? []
    : comparesWithReference
      ? results.slice(0, 1)
      : namedWine !== null
        ? [namedWine]
        : results.length === 1
          ? results
          : [];
  const now = new Date().toISOString();
  for (const result of winesInHand) {
    const references = await grapeReferencesFor(
      database,
      result.wine.grapes.map((grape) => grape.name),
    );
    for (const reference of references) {
      if (reference.text === null) continue;
      const cited: string[] = [];
      for (const sourceUrl of reference.sourceUrls) {
        const sourceId = await librarySourceId(
          sourceUrl === reference.card.evidence[0]?.sourceUrl
            ? reference.card.id
            : `${reference.card.id}:${sourceUrl}`,
        );
        cited.push(sourceId);
        if (!library.sources.some((source) => source.id === sourceId)) {
          library.sources.push({
            canonicalUrl: sourceUrl,
            createdAt: now,
            createdByProvider: "wine-library",
            createdByUserId: null,
            id: sourceId,
            licenseIdentifier: "CC-BY-SA-4.0",
            publisher: "Wikipedia",
            retrievedAt: now,
            sourceType: "open_dataset",
            title: `${reference.card.name} — Wikipedia`,
            updatedAt: now,
          });
        }
      }
      library.statements.push({
        evidenceClass: "researched",
        id: `library-wine-${result.wine.id}-${reference.card.id}`,
        sampleSize: null,
        sourceIds: cited,
        text: `wine library, grape of ${result.wine.displayName}: ${reference.text}`,
      });
      if (!library.grapes.some((grape) => grape.id === reference.card.id)) {
        library.grapes.push({ id: reference.card.id, name: reference.card.name });
      }
    }
  }
  library.grapes.splice(3);
  for (const source of library.sources) citationMap.set(source.id, source);
  const groundStatements = [
    ...(collectionStatement === null ? [] : [collectionStatement]),
    ...semanticStatements,
    ...pairingStatements,
    ...noteStatements,
    ...library.statements,
    ...languageStatements(
      results,
      visibleContext.context,
      tasteProfile,
      priceObservations,
      recommendations,
    ),
  ];
  // Nothing found to answer from: the model is not asked, and the reader is
  // told that — not that the AI failed, which it did not.
  const nothingToGroundOn = noMatches && groundStatements.length === 0;
  const languageResult =
    options.language === null
      ? null
      : await options.language.render({
          locale: options.request.locale,
          message: options.request.message,
          statements: groundStatements,
        });
  if (languageResult !== null) {
    await database
      .prepare(`UPDATE assistant_tool_runs SET model_version = ? WHERE turn_id = ?`)
      .bind(languageResult.modelVersion, turnId)
      .run();
  }
  // The model could not tell what was asked: say so, rather than answer
  // something else from whatever the search happened to find.
  if (languageResult?.unclear === true) return unclearTurn(options, turnId);
  const renderedClaims = languageResult?.claims ?? [];
  return {
    data: {
      citations: [...citationMap.values()].slice(0, 8),
      comparisons,
      evidence,
      libraryGrapes: library.grapes,
      libraryRegions: library.regions,
      libraryTopics: library.topics,
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
                : options.aiBudgetReached === true
                  ? noMatches
                    ? "not_found_capped"
                    : "found_capped"
                  : nothingToGroundOn
                    ? "not_found_empty"
                    : noMatches
                      ? "not_found_failed"
                      : "found_failed",
              results.length,
            )
          : renderedClaims
              .map((claim) => claim.text)
              .join(" ")
              .slice(0, 4_000),
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
      // The wine this answer was about, for the next turn's pronoun to follow: the
      // one named or resolved this turn, else the top match the answer led with
      // (search ranks it first and the statements reach the model in that order),
      // else the wine carried from before. The top match comes before the carried
      // wine so a fresh subject — "¿hay un vino de Marlborough?" — becomes the new
      // thread, while a pure follow-up, which sets namedWine to the carried wine,
      // still stays on it.
      focusWineId:
        namedWine?.wine.id ?? results[0]?.wine.id ?? options.request.context.visibleWineId ?? null,
      wineContext: visibleContext.context,
    },
  };
}
