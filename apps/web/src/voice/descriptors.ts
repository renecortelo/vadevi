import type { VoiceExtractResponse } from "@vadevi/contracts";
import {
  aromaDescriptors,
  aromaNames,
  descriptorsForWineType,
  type OntologyLocale,
  type OntologyWineType,
  type TastingPhase,
} from "@vadevi/i18n/runtime";

type Proposal = VoiceExtractResponse["data"];

/** Text compared without case, accents or punctuation, as the server compares it. */
const plain = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** "flor blanca" hears "Flores blancas": a word matches with or without a plural ending. */
const sameWord = (a: string, b: string) =>
  a === b || a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`;

function says(text: string, label: string): boolean {
  const words = plain(text).split(" ");
  const wanted = plain(label).split(" ");
  for (let start = 0; start + wanted.length <= words.length; start += 1) {
    if (wanted.every((word, index) => sameWord(words[start + index]!, word))) return true;
  }
  return false;
}

/**
 * The tasting words the form offers that a spoken note names: the aromas in
 * the reader's own words ("mantequilla, brioche, flor blanca" → brioche, white
 * flowers), what was said of the nose and of the mouth, and the aromas the
 * model listed in any of the app's languages. Only words that were said; a
 * descriptor never comes from a guess.
 */
export function heardDescriptors(
  proposal: Proposal,
  locale: OntologyLocale,
  wineType: OntologyWineType | null,
): Record<"any" | "nose" | "palate", string[]> {
  const value = (name: string) => {
    const field = proposal.fields[name];
    return field === undefined || field.status !== "explicit" ? null : field.value;
  };
  const listed = value("aromas");
  const aromas = Array.isArray(listed) ? listed : [];
  const nose = [value("noseText"), proposal.fields.aromas?.quote]
    .filter((text): text is string => typeof text === "string")
    .join(" ");
  const palate = [value("palateText"), value("conclusionText")]
    .filter((text): text is string => typeof text === "string")
    .join(" ");
  const found = (phase: TastingPhase, text: string) =>
    descriptorsForWineType(phase, wineType)
      .filter(
        (descriptor) =>
          says(text, descriptor.text[locale].label) ||
          (phase === "nose" &&
            aromas.some((aroma) =>
              Object.values(descriptor.text).some(({ label }) => says(aroma, label)),
            )),
      )
      .map((descriptor) => descriptor.code);
  // The nose's aromas from the library's vocabulary too — the aroma wheel's
  // («miel», «cítricos»), named in any of the app's languages.
  const fromWheel = (text: string) =>
    aromaDescriptors
      .filter((aroma) => {
        const names = Object.values(aromaNames[aroma.term] ?? {});
        return names.some((name) => says(text, name) || aromas.some((said) => says(said, name)));
      })
      .map((aroma) => aroma.code);
  const nosed = [...new Set([...found("nose", nose), ...fromWheel(nose)])];
  // The quick note has one list for both: a cherry said of the mouth counts.
  const any = [
    ...new Set([...found("nose", `${nose} ${palate}`), ...found("palate", palate), ...nosed]),
  ];
  return { any, nose: nosed, palate: found("palate", palate) };
}
