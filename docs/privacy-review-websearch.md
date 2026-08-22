# Privacy review — open-web discovery via Brave Search (optional)

Status: **built, disabled by default.** Enabling it is a deployment decision that
this review must accompany. The public repository ships `WEBSEARCH_PROVIDER`
unset, so `webSearchEnabled()` is false and no request is ever made.

## What it is

An optional discovery provider for the "Investigate this wine" action. A small
producer with a fanciful name is often absent from Wikidata, so a name search
over the open web is sometimes the only way to find anything about the bottle.

It is a **search provider, not a crawler.** The app calls one official search API
host and uses that API's own result snippets and source URLs. It **never fetches
the arbitrary result pages itself**, so the general-web fetch boundary the threat
model guards (§ SSRF: DNS + private-address rechecks) is never opened.

- Provider: Brave Search (`api.search.brave.com`), REST, API-key auth.
- Endpoint: `GET /res/v1/web/search`.
- Adapter: `apps/api/src/adapters/web-search.ts` (fetcher-injected, host-locked,
  cached, rate-limited; every snippet sanitized and length-bounded; result URLs
  pre-filtered to public HTTPS before they can become a source).

## What leaves the device

When enabled, a **search query built from the wine's own identity** — its
producer name, display name, and region — plus the locale, is sent to Brave over
HTTPS with the API key. Nothing else is sent: no personal data, no notes, no
ratings, no user id, no cellar contents.

This is the material change a deployment must weigh: the wine's identity leaves
the device for a third-party search engine, which may log or cache the query
under its own terms. It is the same identity footprint already sent to Wikidata
under `RESEARCH_PROVIDER`, now also going to the search provider. The reader
should be told research uses an external search service before it is turned on.

## What comes back and how it is handled

Result snippets (title, description, source URL). Every string is passed through
`sanitizeExternalText` (control-char stripping, length caps, prompt-injection
rejection) and has HTML tags stripped; a snippet flagged as prompt-like is
dropped. Results are stored as **low-confidence (`curiosity.note`), `other_web`,
proposed** facts, each cited to its source URL, that the reader confirms or
discards. They are never merged into the reader's own records and never presented
as something the reader entered. Web content is low-trust by design, which is why
it sits at the bottom of the confidence scale and always requires confirmation.

## Host and network safety

- Host is fixed to `api.search.brave.com`; redirects off-host are rejected
  (`fetchFromProvider` allow-list). **Before enabling, re-verify the host does not
  resolve to a private/internal address from the deployment's network.**
- Result URLs are never fetched by the app; they are only cited. Each is
  pre-filtered to a public HTTPS URL (no credentials, no private/loopback/link-
  local ranges) before it can become a source, mirroring the strict persistence
  check.
- Bounded response reads, per-provider rate limit, response cached 24 h so a
  repeated identity does not re-query, at most four results kept per search.

## To enable (operator, not the assistant)

1. Read and accept this review; add the external-search disclosure to the UI copy.
2. Enable research first (`RESEARCH_PROVIDER = "open_data"` + a valid
   `EXTERNAL_API_USER_AGENT`) — web search rides on top of it.
3. Obtain a Brave Search API key and store it as the secret `WEBSEARCH_API_KEY`
   (never commit it, never paste it into a prompt).
4. Set `WEBSEARCH_PROVIDER = "brave"`.
5. Confirm the free-tier / paid terms and monthly call allowance fit expected use.

Until every step is done, web search stays off and research uses only the fixed
open-data sources.
