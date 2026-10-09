import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { searchLibraryRegions } from "../services/library";
import { getStats } from "../services/stats";

/** Accents and case do not count when matching what is typed. */
function plain(value: string): string {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("en").trim();
}

/**
 * A region field that suggests as the reader types: the regions they have
 * already used, as the cellar book reads them ("Empordà", however it was
 * typed before), then the names the EU register holds — in the country
 * chosen, when one is. A suggestion is only offered: anything can still be
 * typed, a region outside the register included. So the same place is
 * written the same way next time, and the counts do not split it.
 */
export function RegionInput({
  country,
  id,
  maxLength,
  onChange,
  onCountry,
  value,
}: {
  country: string | null;
  id: string;
  maxLength?: number;
  onChange: (value: string) => void;
  /** A name from the register was chosen: the country it lies in. */
  onCountry?: (code: string) => void;
  value: string;
}) {
  const { user } = useAuth();
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState(value);

  // What is typed settles before the register is asked.
  useEffect(() => {
    const timer = setTimeout(() => setTyped(value), 250);
    return () => clearTimeout(timer);
  }, [value]);

  // The reader's own regions, read once the field is first used.
  const own = useQuery({
    enabled: user !== null && focused,
    queryFn: ({ signal }) => getStats(user!, null, {}, signal),
    queryKey: ["stats", null, "all", {}],
    staleTime: 5 * 60_000,
  });
  const register = useQuery({
    enabled: user !== null && focused && plain(typed).length >= 2,
    queryFn: ({ signal }) => searchLibraryRegions(user!, typed, country, signal),
    queryKey: ["region-suggestions", plain(typed), country],
    staleTime: 5 * 60_000,
  });

  const wanted = plain(value);
  const suggestions = [
    ...(own.data?.facets.regions ?? []).filter(
      (name) => wanted.length === 0 || plain(name).includes(wanted),
    ),
    ...(register.data ?? []).map((region) => region.name),
  ]
    .filter((name, index, all) => all.findIndex((other) => plain(other) === plain(name)) === index)
    .filter((name) => name !== value)
    .slice(0, 12);

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
          // Picked from the register: its country comes with it, unless one
          // is already chosen.
          const registered = (register.data ?? []).find(
            (region) => plain(region.name) === plain(chosen),
          );
          if (registered !== undefined && country === null) onCountry?.(registered.countryCode);
        }}
        onFocus={() => setFocused(true)}
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
