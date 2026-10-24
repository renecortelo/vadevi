# Performance evidence

The §18.4 budgets, measured. Reproduce with:

```bash
pnpm perf
```

It is deliberately outside `pnpm e2e`: the numbers depend on the machine, so a
shared runner would turn them into noise rather than evidence.

## What was measured

Re-measured 24 October 2026, after zod 4.6 (its English messages alone in the
browser), firebase 13 and Vitest 5. Nothing regressed. The initial route's
JavaScript is 222.0 KiB gzip of its 250 KiB budget.

| Measure                              | Median | p95     | Budget  | Verdict |
| ------------------------------------ | ------ | ------- | ------- | ------- |
| LCP — sign-in, Slow 4G, 4× CPU       | 276 ms | 1960 ms | 2500 ms | within  |
| API read `GET /me/bootstrap`         | 14 ms  | 28 ms   | 500 ms  | within  |
| API read `GET /spaces/{id}/wines`    | 13 ms  | 20 ms   | 500 ms  | within  |
| API read `GET /spaces/{id}/sessions` | 10 ms  | 19 ms   | 500 ms  | within  |
| API read `GET /library/grapes`       | 15 ms  | 34 ms   | 500 ms  | within  |
| Interaction — Memory view switch     | 85 ms  | 99 ms   | 200 ms  | within  |
| Quick-log save, online               | 64 ms  | 80 ms   | 800 ms  | within  |

**The quick-log save was measured short before.** The test stopped its clock
at the first `role="status"` on the page, and the draft's autosave line is one
that shows from the start, so it timed little more than the click (25/35 ms on
23 October). It now waits for the saved notice itself.

On 23 October 2026 the sign-in LCP was 324/2044 ms; on 18 October, 428/2124 ms,
with 12–15 ms medians for the API reads.

### The deployed sign-in page, on a phone's profile

The table above is served from the machine itself. On 18 October 2026 the
deployed sign-in page was measured too — the real network and the real
Firebase, a Pixel 5's viewport, 4× CPU, 1.6 Mbps down with 150 ms latency, a
cold cache on each of eight loads:

| Measure (deployed, cold)     | Median  | p95     | Budget  | Verdict   |
| ---------------------------- | ------- | ------- | ------- | --------- |
| LCP, before the change below | 2712 ms | 3144 ms | 2500 ms | over      |
| LCP, after                   | 2568 ms | 2652 ms | 2500 ms | just over |
| CLS                          | 0.000   | 0.000   | 0.1     | within    |
| Time to first byte           | 99 ms   | 213 ms  | —       | —         |

The largest paint is the sign-in paragraph, and it waits on a chain: the
bundle, then `/runtime-config`, then Google's sign-in script and its iframe,
which Firebase loads before it reports "no one is signed in" on phones and
Safari. The page now asks for `/runtime-config` with itself (a preload the app
reuses — one request, not two) and opens its connection to Google early,
which took about 150 ms off the median and 500 ms off the p95. What remains is
Google's script: removing it from start-up would mean opening the sign-in
popup only after loading it, which Safari may block. The next step, if wanted,
is to draw the sign-in screen at once when this device has never signed in. Done on 20 October 2026: with no Firebase session in local storage and
no Google redirect pending, the sign-in screen is drawn before
`/runtime-config` and Google's script arrive (`e2e/instant-sign-in.spec.ts`
holds the configuration back four seconds and finds the sign-in button
within two). The deployed LCP is to be measured again on the phone profile.

Every figure is within a few milliseconds of the previous run except one. The
`sessions` p95 moved from 10 ms to 105 ms while its median did not move at all,
which is the shape of a single slow sample rather than a slower endpoint — one
request behind a cold connection on a laptop that is also running the server.
It is recorded rather than smoothed away: if it is still there on the next run,
with the median still flat, it is worth opening.

The Memory view switch is the interaction the map view was added to, and it
moved by five milliseconds against a 200 ms budget. The map itself is lazily
loaded and Leaflet does not enter the initial route, which the bundle budget
independently confirms.

The API rows are read out of resource timing, from the requests the application
itself makes. The first version of this file issued its own requests instead, at
paths that do not exist and without the bearer token the application holds — so
it timed three 404s and reported them as reads. The figures were an order of
magnitude too good and measured nothing. Corrected here, and the measurement now
fails if the screen made no API request at all.

Run on a development machine, against the production build served by Wrangler at
one origin — the same way the browser tests run.

## What these numbers are not

Worth stating plainly, because the budgets are written in field terms and this is
a lab:

- **LCP** is measured on a quarter-speed CPU over Slow 4G, which approximates a
  mid-range phone. The budget is p75 across real devices. A lab figure under
  budget is good evidence and not the same claim.
- **INP cannot be measured in a lab at all.** It is a p75 over a real session's
  interactions. The row above is interaction latency — click to next paint — for
  an interaction the main flow actually performs. It is the closest honest proxy
  and is reported as one, not as INP.
- **The API percentiles are of a local Worker against a local D1**, on the same
  machine, with no network in between. They are a floor. What they establish is
  that the application's own work is not the bottleneck; what a deployment adds
  on top has to be watched on the deployment.

## What would close the gap

Neither of the remaining gaps can be closed from a development machine:

- Field LCP and INP need real sessions. The honest route is the `web-vitals`
  library reporting to an endpoint the deployment owns — which is itself a
  privacy decision, since it means collecting timing data about members.
- Deployed API percentiles need the authenticated flow against the real Firebase
  and the real D1, which cannot be automated: the sign-in is a Google popup. The
  practical substitute is watching the network panel during the manual
  acceptance run and noting anything that feels slow.

Until then, what is established is a floor and a lab profile, and this file says
so rather than ticking a field budget it did not measure.
