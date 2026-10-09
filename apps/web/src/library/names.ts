import { useQuery } from "@tanstack/react-query";
import { resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import { getLibraryRegionNames, listLibraryGrapes } from "../services/library";

const day = 24 * 60 * 60_000;

/**
 * Grapes and regions as one name each, whatever was typed.
 *
 * A wine keeps its grapes and region as they were typed — "Samsó", "DO
 * Empordà" — and, where the wine library knows them for certain, a link to
 * its card. Shown through these, a linked grape reads as the library names it
 * in the language the app is in, and follows it when it changes; a linked
 * region reads as the register writes it, the legal name a label carries in
 * every language. Anything unlinked, or anything while the library cannot be
 * reached, reads as it was typed.
 */
export function useLibraryNames(regionRefs: readonly (string | null | undefined)[] = []) {
  const { i18n } = useTranslation();
  const locale = resolveSupportedLocale(i18n.language);
  const { user } = useAuth();
  const grapes = useQuery({
    enabled: user !== null,
    queryFn: ({ signal }) => listLibraryGrapes(user!, locale, signal),
    queryKey: ["library-grape-names", locale],
    staleTime: day,
  });
  const refs = [
    ...new Set(regionRefs.filter((ref): ref is string => typeof ref === "string")),
  ].sort();
  const regions = useQuery({
    enabled: user !== null && refs.length > 0,
    queryFn: ({ signal }) => getLibraryRegionNames(user!, refs.slice(0, 100), signal),
    queryKey: ["library-region-names", refs.join(",")],
    staleTime: day,
  });
  const grapeNames = new Map((grapes.data ?? []).map((grape) => [grape.id, grape.name]));
  const regionNames = new Map((regions.data ?? []).map((region) => [region.id, region.name]));
  return {
    grape: (grape: { libraryId?: string | null | undefined; name: string }) =>
      (grape.libraryId == null ? undefined : grapeNames.get(grape.libraryId)) ?? grape.name,
    region: (wine: { region: string | null; regionRef?: string | null | undefined }) =>
      (wine.regionRef == null ? undefined : regionNames.get(wine.regionRef)) ?? wine.region,
  };
}
