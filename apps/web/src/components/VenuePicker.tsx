import type { SupportedLocale } from "@vadevi/contracts";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import { MapLink } from "./MapLink";
import { type Place, reversePlace, searchPlaces } from "../services/places";
import { parsePastedPoint } from "./coordinates";

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
  label,
  latitude,
  longitude,
  onChoose,
  onRename,
  spaceId,
  value,
}: {
  /** What this field is called here: a tasting's place, an event's venue. */
  label?: string | undefined;
  /** The point already recorded for this place, so it can be opened on a map. */
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
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
  // The reader's own position, held in memory for this form only: it orders the
  // results by how near they are. It is never stored, and it only ever travels
  // as a coarse box — the ordering itself happens on our own server.
  const position = useRef<{ latitude: number; longitude: number } | null>(null);
  // Asked once. A reader who said no is not asked again on every search.
  const positionRefused = useRef(false);

  // The typed name lives in the draft, not in this component: a restored draft or
  // a cleared form is then simply a different `value`, with no local copy to fall
  // out of step with it.
  const query = value;

  /**
   * The reader's position, if we can have it.
   *
   * A name search is useless without it — "Can Pau" matches a bar in another
   * country as readily as the one down the road, and the reader is standing in
   * exactly one of them. So the position is asked for at search time too, not
   * only for "I'm here". It is asked ONCE: a refusal is remembered, the search
   * runs unordered, and nothing nags.
   */
  async function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
    if (position.current !== null) return position.current;
    if (positionRefused.current || navigator.geolocation === undefined) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (reading) => {
          position.current = {
            latitude: reading.coords.latitude,
            longitude: reading.coords.longitude,
          };
          resolve(position.current);
        },
        () => {
          positionRefused.current = true;
          resolve(null);
        },
        { enableHighAccuracy: false, maximumAge: 300_000, timeout: 10_000 },
      );
    });
  }

  async function runSearch() {
    if (user === null || query.trim().length < 3) return;
    setSearching(true);
    setNotice(null);
    try {
      const near = await currentPosition();
      const found = await searchPlaces(
        user,
        spaceId,
        query.trim(),
        placeLocale(i18n.language),
        near ?? undefined,
      );
      setPlaces(found);
      // Said in full, because "not found" invites the reader to conclude the
      // search is broken. OpenStreetMap holds the places somebody mapped, so a
      // small bar may genuinely not be in it, and there are two ways on.
      if (found.length === 0) setNotice(t("tasting.venue.noMatches"));
      // Said plainly, because an unordered list of same-named places in three
      // countries is confusing unless you know why it is not sorted.
      else if (near === null) setNotice(t("tasting.venue.unordered"));
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
        <span>{label ?? t("tasting.field.venueName")}</span>
        <input
          maxLength={200}
          onChange={(event) => {
            const typed = event.target.value;
            // Pasting a point is how a reader records a place OpenStreetMap does
            // not know: they find it in a map that does, copy the coordinates,
            // and paste them here. The field then holds a place with a point and
            // no name yet, which they type over.
            const pasted = parsePastedPoint(typed);
            if (pasted === null) {
              onRename(typed);
              return;
            }
            onChoose({
              area: null,
              city: null,
              countryCode: null,
              latitude: pasted.latitude,
              longitude: pasted.longitude,
              name: value.trim().length > 0 ? value.trim() : t("tasting.venue.pastedName"),
            });
            setPlaces(null);
            setNotice(t("tasting.venue.pastedPoint"));
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
        <MapLink
          className="action-link action-link--secondary"
          latitude={latitude}
          longitude={longitude}
          name={value}
        />
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
      <p className="venue-picker__hint">{t("tasting.venue.pasteHint")}</p>
      <p className="venue-picker__attribution">{t("tasting.venue.attribution")}</p>
    </div>
  );
}
