# Privacy review: Open Food Facts barcode lookup

§15.8 and §12.1 require a deployment-specific privacy review before an optional
research provider is enabled. This document is that review for Open Food Facts,
prepared so the deployer can approve or reject it on evidence.

**Current state: not enabled.** `RESEARCH_PROVIDER=none` is the default in
`.dev.vars.example` and `wrangler.example.jsonc`, and stays that way unless a
deployer changes it deliberately.

- Decision: ☐ approved ☐ rejected
- Decided by: ______________________
- Date: ______________________

## What the capability does

When a user scans a barcode, the application asks Open Food Facts whether that
barcode is a known product, and offers the returned brand and product name as a
**low-confidence, `researched` candidate** the user must confirm or correct
before anything is saved.

It is the weakest of four candidate sources. Barcode matches against the user's
own Space, label OCR, and text matching all run first and need no provider.

## What leaves the deployment

Exactly one thing: **the barcode digits**.

```
GET https://world.openfoodfacts.org/api/v3/product/<barcode>.json
User-Agent: VaDeVi/0.1 (https://<your-contact>)
```

What is **never** sent:

| Not sent                                  | Why it matters                                                        |
| ----------------------------------------- | --------------------------------------------------------------------- |
| The label photo                           | Images stay in your R2 bucket. §12.1 also forbids reusing OFF images. |
| Any wine, tasting note, or comment        | The request carries no application data.                              |
| User identity, email, or Firebase UID     | The provider cannot associate lookups with a person.                  |
| Space identity                            | The provider cannot group lookups by household.                       |
| Location or IP beyond the Worker's egress | Requests originate from Cloudflare's edge, not the user's device.     |

The identifying `User-Agent` is required by Open Food Facts' terms. It names the
application and a contact URL that you choose — it is not a user identifier.

## What the provider can infer

Open Food Facts sees a stream of barcode lookups from one Cloudflare egress
carrying your application's user agent. From that they could infer that _someone_
using your deployment scanned a particular product at a particular time.

They cannot tell **who**, cannot tell **which Space**, and receive nothing about
what the user thought of the wine. For a private deployment with a handful of
members this is a small but non-zero disclosure: a barcode is a statement that
someone, somewhere in your household, handled that bottle.

If that is unacceptable for your deployment, reject this review. The application
is fully usable without it.

## What is stored, and where

- **Cached in your D1**, not the provider's: the normalized barcode, the bounded
  candidate fields, and the attribution metadata, under a TTL. Migration `0008`
  defines this cache and explicitly excludes full provider payloads and images.
- **Never stored**: the raw provider response body, provider images, and any
  field the adapter's schema did not select.
- Facts created from a confirmed candidate carry a citation to the Open Food
  Facts source record, so the origin stays visible in the evidence screen.

## Provider retention and terms

Open Food Facts is an open-data project. Their database contents and images
carry **distinct licenses** (§12.1), which is why the application stores
attribution and license metadata alongside cached results and does not reuse
provider images.

Va de Vi performs **read-only** lookups and never writes to Open Food Facts.

Their retention of inbound request logs is governed by their own policy, not by
this application. **Recheck their current terms and privacy policy on the day
you enable this**, and record the date below — the provider is free to change
them.

- Terms/policy checked on: ______________________

## Limits and cost

- Application rate budgets sit below the provider's documented read limits.
- The `barcode_lookups` daily cap (60 per user, 500 globally) is enforced before
  any call, and reaching it degrades to the Space-match and manual path.
- No paid tier exists and no automatic upgrade is possible.

## Honest assessment of value

Open Food Facts is a **food** database. Wine coverage is thin and inconsistent,
and §21 already lists comprehensive wine coverage as a non-goal. Expect many
bottles to return nothing.

The disclosure is small, but so is the benefit. A reasonable deployer could
decline this and lose very little — the barcode is still useful without it,
because matching against wines already in the Space needs no provider at all.

## How to enable

Only after the decision above is recorded:

```
RESEARCH_PROVIDER=open_data
EXTERNAL_API_USER_AGENT=VaDeVi/0.1 (https://your-contact-url)
```

`pnpm validate:env` rejects `open_data` without a compliant identifying user
agent, so a deployment cannot enable this anonymously.

## How to disable

Set `RESEARCH_PROVIDER=none` and redeploy. Cached rows expire on their TTL, or
can be cleared immediately:

```sql
DELETE FROM external_adapter_cache;
```
