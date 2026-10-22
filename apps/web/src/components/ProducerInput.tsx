import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { searchLibraryWineries } from "../services/library";

/** Accents and case do not count when matching what is typed. */
function plain(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("en").trim();
}

/**
 * A producer field that suggests as the reader types: the wineries the
 * library knows (from Wikidata) whose name holds what is typed — in the
 * country chosen, when one is. A suggestion is only offered: any producer
 * can still be typed. Picking one fills in its country, unless one is
 * already chosen.
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
  const { user } = useAuth();
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState(value);

  // What is typed settles before the library is asked.
  useEffect(() => {
    const timer = setTimeout(() => setTyped(value), 250);
    return () => clearTimeout(timer);
  }, [value]);

  const library = useQuery({
    enabled: user !== null && focused && plain(typed).length >= 2,
    queryFn: ({ signal }) => searchLibraryWineries(user!, typed, country, signal),
    queryKey: ["winery-suggestions", plain(typed), country],
    staleTime: 5 * 60_000,
  });
  const suggestions = (library.data ?? [])
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
          const known = (library.data ?? []).find((winery) => winery.name === chosen);
          if (known !== undefined && country === null) onCountry?.(known.countryCode);
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
