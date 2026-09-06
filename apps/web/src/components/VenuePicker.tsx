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
 * comes with them. "Use my location" is for the places a geocoder does not know:
 * a friend's terrace has no entry to find, but it does have coordinates, so the
 * position is offered as the venue itself and the reader names it.
 *
 * The position is read only when that button is pressed. Nothing is watched, and
 * the browser asks its own permission first.
 */
export function VenuePicker({
  onChoose,
  spaceId,
  value,
}: {
  onChoose: (venue: ChosenVenue) => void;
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
            // Even when the geocoder names nothing here, the point itself is a
            // usable venue: the reader keeps their own name for the place.
            setPlaces(
              found.length > 0
                ? found
                : [
                    {
                      area: null,
                      city: null,
                      countryCode: null,
                      displayName: t("tasting.venue.hereDescription"),
                      latitude,
                      longitude,
                      name: query.trim().length > 0 ? query.trim() : t("tasting.venue.here"),
                    },
                  ],
            );
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
          onChange={(event) => {
            // A hand-typed venue is still a venue; it simply has no point until
            // the reader picks one from the list.
            onChoose({
              area: null,
              city: null,
              countryCode: null,
              latitude: null,
              longitude: null,
              name: event.target.value,
            });
          }}
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
