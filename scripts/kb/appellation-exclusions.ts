import { matchKey } from "./appellation-names";

// Items Wikidata files under another wine's name by a stray alias, checked
// by hand: Arrábida carries "Bairrada (DOC)", Provence's whole wine region
// answers to Bellet, the Côtes de Bordeaux to its Saint-Macaire, the
// Domaine de la Romanée-Conti to the grand cru it owns, and Rosso Piceno
// superiore to the DOC it belongs to.
export const notThisItem: Record<string, string[]> = {
  bairrada: ["Q2879982"],
  bellet: ["Q815934"],
  "cotes de bordeaux saint macaire": ["Q3010713"],
  // The Domaine de la Romanée-Conti, the estate, not its grand cru.
  "romanee conti": ["Q2142623"],
  // Rosso Piceno superiore, one of the DOC's wines, answers to "Piceno".
  piceno: ["Q3941677"],
  "rosso piceno": ["Q3941677"],
  // Manchego cheese, a PDO of its own, answers to the wine's "La Mancha":
  // its names ("Queso Manchego", "Manchego cheese PDO") are not the wine's.
  "la mancha": ["Q72305"],
  // Wines named after a larger one, or one of its kinds, matched to its item:
  // Bordeaux's whole wine region, Beaune's commune wine, Alto Adige's DOC,
  // the Oltrepò Pavese DOC. Each is a registered name of its own.
  "sainte foy bordeaux": ["Q168461"],
  "chorey les beaune": ["Q2893254"],
  "savigny les beaune": ["Q2893254"],
  trentino: ["Q140131057"],
  "oltrepo pavese metodo classico": ["Q3351573"],
  // A larger or neighbouring wine that lists the name among its aliases, where
  // the name has an item of its own (P14, 12 October 2026): the whole Rhône
  // valley, the Côtes du Rhône for its Villages, the Coteaux du Languedoc for
  // La Clape, and Montefalco rosso, one of the DOC's wines, for the DOC.
  "cotes du rhone": ["Q1891041"],
  "cotes du rhone villages": ["Q1151005"],
  "la clape": ["Q1136603"],
  montefalco: ["Q3322614"],
  // Friuli Isonzo DOC, one of the region's DOCs, answers to "Friulian wine".
  friuli: ["Q443118"],
};

/** Whether an item may stand for the registered name it was matched by. */
export function allowedItem(name: string, id: string): boolean {
  return !(notThisItem[matchKey(name)] ?? []).includes(id);
}
