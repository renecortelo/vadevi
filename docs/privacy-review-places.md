# Privacy review — venue lookup (OpenStreetMap/Nominatim, optional)

Status: **built, disabled by default.** Enabling it is a deployment decision that
this review must accompany. The public repository ships `PLACES_PROVIDER` set to
`none`, so `placeSearchEnabled()` is false, the routes answer `503`, and no
request is ever made.

## What it is

Optional lookup for the venue field of a tasting: where a bottle was drunk. A
typed place name is resolved to a real place with coordinates, so two visits to
the same bar are recognizably the same bar rather than two spellings, and a
tasting can later be found on a map.

The provider is **Nominatim**, the geocoder of the OpenStreetMap project
(`nominatim.openstreetmap.org`, `GET /search` and `GET /reverse`). It was chosen
over the commercial map APIs for reasons that are as much privacy as licensing:
there is no key to hold, no per-request contract with an advertising company, and
its data is ODbL — attributable, which the UI does, on every result list.

Adapter: `apps/api/src/adapters/place-search.ts` (fetcher-injected, host-locked to
that single hostname, cached, rate-limited; every returned string sanitized and
length-bounded).

## What leaves the device

Only when the reader acts. Nothing is looked up as they type, and nothing is
looked up in the background.

- **Searching a venue** sends what they typed (max 200 characters) and the
  interface locale.
- **Searching also asks the browser for their position**, because a name search
  is close to useless without it: "Can Pau" matches a bar in another country as
  readily as the one down the road, and the reader is standing in exactly one of
  them. The browser prompts; a refusal is remembered and never asked again in
  that form, and the search still runs — unsorted, and the interface says so.
- **What reaches the provider is a coarse box**, roughly ±55 km around them, to
  bias its own ranking. The precise position never leaves the Worker: the
  distance ordering is computed there, from the point the browser gave us, and
  is applied on the way out of the cache as well as into it so nobody inherits a
  neighbour's ordering.
- **"I'm here"** sends their coordinates to be turned into a place. This and the
  box above are the material change a deployment must weigh: a position is more
  sensitive than a wine name. It is read only after the browser's own permission
  prompt, only when they search or press that button, and never watched
  continuously.

No account identifier, no wine, no note, no cellar, and no other tasting is ever
sent. The reader's IP address does not reach Nominatim either: the browser never
calls it — the CSP forbids that — and the Worker makes the request, so the
provider sees the deployment, not the reader.

Coordinates are carried in **POST bodies, never query strings**, so a position
does not end up in an access log, a browser history entry, or a Referer header.

## What comes back and how it is handled

A short list of places: name, the address parts (city, area, country code), the
full display name, and a point. Every string passes through `sanitizeExternalText`
— control-character stripping, length caps, prompt-injection rejection — and a
result whose coordinates cannot be parsed is dropped rather than stored as a name
with no point.

## What is stored

Only what the reader picked, on the tasting they were filling in: the venue name,
city, area, country code (already there since `0018`) and now the pair of
coordinates (`0019`, `venue_latitude` / `venue_longitude`). An event records the
same point (`0020`, on `tasting_sessions`). Both halves are written together or
not at all.

A recorded place offers a link to Google Maps, for directions. It is a plain
link the reader chooses to follow, not an embed: nothing is requested from
Google unless they click it, so opening a tasting or an event tells nobody where
it happened. The link carries `noreferrer`, so the map is not told which page
sent them, and it prefers the coordinates over the name — a point is
unambiguous, and it keeps the wine and the tasting out of the URL entirely.

The point belongs to the **tasting**, not to the wine: it records where a bottle
was drunk, never where it was grown, and it is never read as the wine's origin.
It is Space-scoped like every other tasting field, so the members who could
already see the tasting can see its place, and nobody else.

The reader's live position is never stored. It is held in the form's memory for
as long as that form is open and is discarded with it.

## Rate limiting, caching, and courtesy

Nominatim is donated infrastructure with a published usage policy: an identifying
user agent with a contact, and at most one request a second. `validate-env`
refuses to start with `PLACES_PROVIDER=openstreetmap` and no `VaDeVi/*` agent
carrying an HTTPS contact; the adapter caps the whole deployment at 30 requests a
minute and caches each result for seven days — a venue does not move, so the same
bar twice asks once. Lookups are also metered against the existing daily
`research_lookups` budget, so they cannot escape the application's own cap.

## Degradation

With the provider off, unreachable, rate-limited, or over budget, the venue
fields stay exactly what they were before this feature: four text inputs the
reader fills in by hand. A geocoder that is down returns an empty list and a
notice, never an error that interrupts a tasting mid-form.

## Enabling it

Set `PLACES_PROVIDER=openstreetmap` together with a valid
`EXTERNAL_API_USER_AGENT`. Tell readers, before turning it on, that the venue
field uses OpenStreetMap and that pressing "I'm here" sends their position to it.
