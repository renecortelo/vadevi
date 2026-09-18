# Privacy review — SommelierX food-and-wine pairing (optional)

Status: **built, disabled by default, and no longer the only way to pair.** The
public repository ships `PAIRING_PROVIDER=local`, which answers from a rule set
inside the Worker and makes no request at all. This provider is reached only by
changing that to `sommelierx` and supplying a key, which is a deployment decision
this review must accompany.

Weigh it against the free alternative rather than against nothing. `local` costs
nothing, works offline, and sends the dish nowhere; its limit is that a rule set
is a good sommelier's floor and not their ceiling. This provider may know things
the rules do not — and charges, and sees every dish a reader types.

## What it is

An optional provider that answers "what wine styles suit this dish", so the
assistant can rank the reader's **own** wines against a dish. It never recommends
a bottle the reader does not have; the pairing knowledge is only used to derive
matching criteria (wine type, grapes, region) for wines already in the cellar.

- Provider: SommelierX (`api.sommelierx.com`), REST, API-key auth.
- Endpoint: `POST /api/v1/pairing/by-text`.
- Adapter: `apps/api/src/adapters/sommelierx.ts` (fetcher-injected, host-locked,
  cached, rate-limited, all external text sanitized and length-bounded).

## What leaves the device

When enabled, the **dish text the reader types** (e.g. "grilled salmon with
asparagus") and the locale are sent to SommelierX over HTTPS with the API key.
Nothing else is sent: no wine records, no notes, no identifiers, no user id.

This is the material change a deployment must weigh: a free-text culinary query
leaves the device for a third party. It may be logged or cached by that provider
under their own terms. The reader should be told pairing uses an external service
before it is turned on.

## What comes back and how it is handled

Wine-style suggestions (name, colour, region, country, grapes, description, a
match percentage). All strings are passed through `sanitizeExternalText`
(control-char stripping, length caps, prompt-injection rejection) before use, and
are treated as external knowledge — cited as such, never merged into the reader's
own records, never presented as a fact the reader entered.

## Host and network safety

- Host is fixed to `api.sommelierx.com`; redirects off-host are rejected
  (`fetchFromProvider` allow-list). **Before enabling, re-verify the host does not
  resolve to a private/internal address from the deployment's network** and that
  the fixed host is still correct.
- Bounded response reads, 5 s timeout, per-provider rate limit, response cached
  24 h so repeated dishes do not re-query.

## To enable (operator, not the assistant)

1. Read and accept this review; add the external-service disclosure to the UI copy.
2. Obtain a SommelierX API key (`sk_live_…`) and store it as the secret
   `SOMMELIERX_API_KEY` (never commit it, never paste it into a prompt).
3. Set `PAIRING_PROVIDER = "sommelierx"` and a valid `EXTERNAL_API_USER_AGENT`.
4. Confirm the free-tier / paid terms and daily call allowance fit expected use.

Until every step is done, pairing stays off and the assistant answers without it.

## The other direction: dish ideas for a wine

Asking "what can I eat with this bottle?" is not something this provider can
answer — it maps a dish to wine styles, not the reverse. That question is instead
answered by Workers AI (the same `AI_PROVIDER=cloudflare` used elsewhere) from the
wine's **own recorded attributes** — type, grapes, region, vintage, and the
reader's own tasting lines. Those attributes go to Cloudflare's model; no other
wine, no cellar list, and no identifier is sent. The result is surfaced as an
explicit suggestion (`inferred`), never as a stored fact about the bottle, and it
is skipped entirely when Workers AI is off.
