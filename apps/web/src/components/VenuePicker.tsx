import type { SupportedLocale } from "@vadevi/contracts";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import { type Place, reversePlace, searchPlaces } from "../services/places";

const supportedLocales = new Set<SupportedLocale>([
  "ca",
  "de",
  "en",
  "es",
  "fr",
  "it",
  "nl",
  "pt-PT",
]);

function placeLocale(language: string): SupportedLocale {
  if (supportedLocales.has(language as SupportedLocale)) return language as SupportedLocale;
  const base = language.split("-", 1)[0];
  return supportedLocales.has(base as SupportedLocale) ? (base as SupportedLocale) : "en";
}

/** What the picker hands back once a place is chosen — or cleared. */
export type ChosenVenue = Readonly<{
  area: string | null;
  city: string | null;
  countryCode: string | null;
  latitude: number | null;
  longitude: number | null;
  name: string;
}>;

/**
 * Look up where a tasting happened.
 *
 * The reader types a venue and picks one from the list, so the same bar twice is
 * the same bar — the name, city, area and country arrive filled in, and the point
 * comes with them. "I'm here" is for the places a geocoder does not know: a
 * friend's terrace has no entry to find, but it does have coordinates, so it
 * fills the fields from where the reader is standing.
 *
 * Typing only ever renames the place. A reader who took a point and then called
 * it "la terraza de Marta" keeps the point, and a name they typed themselves is
 * never overwritten by a map that thinks the place is a street.
 *
 * The position is read only when that button is pressed. Nothing is watched, and
 * the browser asks its own permission first.
 */
export function VenuePicker({
  onChoose,
  onRename,
  spaceId,
  value,
}: {
  /** A place was picked: name, address parts and point, all at once. */
  onChoose: (venue: ChosenVenue) => void;
  /** The reader typed their own name for the place. Nothing else changes. */
  onRename: (name: string) => void;
  spaceId: string;
  value: string;
}) {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The reader's own position, held in memory for this form only: it biases a
  // later search towards where they are. It is never stored and never sent
  // unless they asked for a lookup.
  const position = useRef<{ latitude: number; longitude: number } | null>(null);

  // The typed name lives in the draft, not in this component: a restored draft or
  // a cleared form is then simply a different `value`, with no local copy to fall
  // out of step with it.
  const query = value;

  async function runSearch() {
    if (user === null || query.trim().length < 3) return;
    setSearching(true);
    setNotice(null);
    try {
      const found = await searchPlaces(
        user,
        spaceId,
        query.trim(),
        placeLocale(i18n.language),
        position.current ?? undefined,
      );
      setPlaces(found);
      if (found.length === 0) setNotice(t("tasting.venue.noMatches"));
    } catch {
      setNotice(t("tasting.venue.error"));
    } finally {
      setSearching(false);
    }
  }

  function locateMe() {
    if (user === null || navigator.geolocation === undefined) {
      setNotice(t("tasting.venue.noGeolocation"));
      return;
    }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (reading) => {
        const latitude = reading.coords.latitude;
        const longitude = reading.coords.longitude;
        position.current = { latitude, longitude };
        void reversePlace(user, spaceId, latitude, longitude, placeLocale(i18n.language))
          .then((found) => {
            // "I'm here" answers a question with one answer, so it fills the
            // fields rather than offering a list of one to click through.
            const here = found[0];
            // A name the reader already typed is theirs and wins: they know the
            // friend's terrace is "la terraza de Marta", the map only knows the
            // street. Failing that, the geocoder's name, then a plain "Here" —
            // because even an unnamed point is a usable venue.
            const typed = query.trim();
            onChoose({
              area: here?.area ?? null,
              city: here?.city ?? null,
              countryCode: here?.countryCode ?? null,
              latitude,
              longitude,
              name: typed.length > 0 ? typed : (here?.name ?? t("tasting.venue.here")),
            });
            setPlaces(null);
            setNotice(t("tasting.venue.hereFilled"));
          })
          .catch(() => setNotice(t("tasting.venue.error")))
          .finally(() => setLocating(false));
      },
      () => {
        setLocating(false);
        setNotice(t("tasting.venue.locationDenied"));
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  }

  function choose(place: Place) {
    setPlaces(null);
    setNotice(null);
    onChoose({
      area: place.area,
      city: place.city,
      countryCode: place.countryCode,
      latitude: place.latitude,
      longitude: place.longitude,
      name: place.name,
    });
  }

  return (
    <div className="venue-picker">
      <label>
        <span>{t("tasting.field.venueName")}</span>
        <input
          maxLength={200}
          onChange={(event) => onRename(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            void runSearch();
          }}
          placeholder={t("tasting.venuePlaceholder")}
          value={query}
        />
      </label>
      <div className="venue-picker__actions">
        <button
          className="action-link action-link--secondary"
          disabled={searching || query.trim().length < 3}
          onClick={() => void runSearch()}
          type="button"
        >
          {searching ? t("tasting.venue.searching") : t("tasting.venue.searchAction")}
        </button>
        <button
          className="action-link action-link--secondary"
          disabled={locating}
          onClick={() => locateMe()}
          type="button"
        >
          {locating ? t("tasting.venue.locating") : t("tasting.venue.hereAction")}
        </button>
      </div>
      {notice === null ? null : (
        <p className="venue-picker__notice" role="status">
          {notice}
        </p>
      )}
      {places === null || places.length === 0 ? null : (
        <ul className="venue-picker__results">
          {places.map((place) => (
            <li key={`${place.latitude},${place.longitude},${place.name}`}>
              <button onClick={() => choose(place)} type="button">
                <strong>{place.name}</strong>
                <span>{place.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="venue-picker__attribution">{t("tasting.venue.attribution")}</p>
    </div>
  );
}
