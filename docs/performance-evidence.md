# Performance evidence

The §18.4 budgets, measured. Reproduce with:

```bash
pnpm perf
```

It is deliberately outside `pnpm e2e`: the numbers depend on the machine, so a
shared runner would turn them into noise rather than evidence.

## What was measured

| Measure                              | Median | p95     | Budget  | Verdict |
| ------------------------------------ | ------ | ------- | ------- | ------- |
| LCP — sign-in, Slow 4G, 4× CPU       | 468 ms | 2172 ms | 2500 ms | within  |
| API read `GET /me/bootstrap`         | 10 ms  | 15 ms   | 500 ms  | within  |
| API read `GET /spaces/{id}/wines`    | 10 ms  | 18 ms   | 500 ms  | within  |
| API read `GET /spaces/{id}/sessions` | 8 ms   | 10 ms   | 500 ms  | within  |
| Interaction — Memory view switch     | 63 ms  | 73 ms   | 200 ms  | within  |
| Quick-log save, online               | 25 ms  | 29 ms   | 800 ms  | within  |

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
