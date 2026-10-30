import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState } from "react";

import { loadWineryList } from "../services/library";

/** Accents, case and punctuation do not count when matching what is typed. */
function plain(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * A producer field that suggests as the reader types: the wineries the
 * library knows (from Wikidata and OpenStreetMap) whose name holds what is
 * typed — those whose name begins with it first — in the country chosen,
 * when one is. The list is one static file, fetched the first time the field
 * is used and searched here, so typing never reaches the database. A
 * suggestion is only offered: any producer can still be typed. Picking one
 * fills in its country, unless one is already chosen.
 */
export function ProducerInput({
  country,
  id,
  maxLength,
  onChange,
  onCountry,
  required,
  value,
}: {
  country: string | null;
  id: string;
  maxLength?: number;
  onChange: (value: string) => void;
  /** A winery from the library was chosen: the country it is in. */
  onCountry?: (code: string) => void;
  required?: boolean;
  value: string;
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState(value);

  // What is typed settles before the list is searched.
  useEffect(() => {
    const timer = setTimeout(() => setTyped(value), 250);
    return () => clearTimeout(timer);
  }, [value]);

  const library = useQuery({
    enabled: focused,
    queryFn: ({ signal }) => loadWineryList(signal),
    queryKey: ["winery-list"],
    staleTime: Infinity,
  });
  const searchable = useMemo(
    () => (library.data ?? []).map(([name, code]) => ({ code, key: ` ${plain(name)}`, name })),
    [library.data],
  );
  const matches = useMemo(() => {
    const wanted = plain(typed);
    if (wanted.length < 2) return [];
    const code = country?.toUpperCase() ?? null;
    const found = searchable.filter(
      (winery) => (code === null || winery.code === code) && winery.key.includes(wanted),
    );
    // A name that begins with what is typed first, then one with a word that does.
    const rank = (key: string) =>
      key.startsWith(` ${wanted}`) ? 0 : key.includes(` ${wanted}`) ? 1 : 2;
    return found
      .sort((one, other) => rank(one.key) - rank(other.key) || one.name.localeCompare(other.name))
      .slice(0, 12);
  }, [country, searchable, typed]);
  const suggestions = matches
    .map((winery) => winery.name)
    .filter((name, index, all) => all.indexOf(name) === index && name !== value);

  return (
    <>
      <input
        autoComplete="off"
        id={id}
        list={listId}
        {...(maxLength === undefined ? {} : { maxLength })}
        onChange={(event) => {
          const chosen = event.target.value;
          onChange(chosen);
          const known = matches.find((winery) => winery.name === chosen);
          if (known !== undefined && country === null) onCountry?.(known.code);
        }}
        onFocus={() => setFocused(true)}
        {...(required === true ? { required } : {})}
        value={value}
      />
      <datalist id={listId}>
        {suggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
    </>
  );
}
