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
};

/** Whether an item may stand for the registered name it was matched by. */
export function allowedItem(name: string, id: string): boolean {
  return !(notThisItem[matchKey(name)] ?? []).includes(id);
}
