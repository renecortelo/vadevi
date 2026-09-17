# ADR-0007: Export and deletion boundary

- Status: accepted
- Date: 2026-08-14
- Affects: `AC-063`, `AC-064`, §15.7

## Context

Phase 6 owes users a real export and a real deletion. Both touch every table in
a Space, both can leak another member's private content if scoped carelessly,
and both can be retried by a user who is not sure whether the first attempt
worked.

## Decision

### Export scope follows role, and author privacy overrides both

An owner or admin exports the whole Space. A member exports their own
contributions plus the shared wine metadata they can already read.

Independently of that, an unsubmitted draft tasting note is author-only in
**every** scope. A Space-wide owner export does not include another member's
draft. Phase 3 established that a draft is private until its author submits it,
and an export is not an exception to that rule.

### JSON is canonical, CSV is selected, media is opt-in

JSON carries a `schemaVersion` so an archive stays interpretable after the
application contract moves on. CSV covers one explicitly chosen dataset at a
time. Media bytes are never included implicitly: the JSON lists each asset with
`selectionRequired: true`, and a ZIP is produced only for an explicit selection
of ids the requester is authorized to read.

Media ids the requester cannot read are skipped rather than reported as errors,
so an archive never reveals that another Space owns them.

CSV cells beginning `=`, `+`, `-`, `@`, tab, or carriage return are prefixed
with a quote. Exported text is user-controlled, and a spreadsheet must not
execute it.

The ZIP is written inside the Worker with a small stored-method writer rather
than handed to a packaging service, because the bytes are private photos.

### Deletion is confirmed, recoverable, scheduled, and idempotent

Space deletion requires a typed confirmation matching the Space name and is
owner-only. Account deletion requires a sign-in within the last 15 minutes.

Both create a job with a recoverable grace period rather than purging inline.
The product owner set this to **one month for both** on 2026-08-14, closing the
§23 decision that was previously open.

A partial unique index allows at most one open job per target, so repeating a
confirmation returns the job that already exists instead of scheduling a second
purge. The scheduled handler executes due jobs, so a confirmed purge never waits
for the requester to return. Re-running the executor after a partial failure
completes the same work and changes nothing once the job is complete.

Account deletion purges the personal Space, detaches the account from shared
Spaces, and anonymizes the user row. It does **not** delete shared records that
other members still rely on.

### Leaving is not deleting

A member leaves a non-personal Space without deleting shared records.
Authorship is pseudonymized only when the member asks for it, and the audit
trail keeps a pseudonymous membership reference, because history must not be
falsified. A personal Space is deleted with the account rather than left.

## Consequences

- An export can be large. It is generated synchronously and streamed with
  `Cache-Control: private, no-store`; if Space sizes grow beyond what one
  request can serve, this becomes a job like research already is.
- The grace period means "deleted" in the UI means "scheduled for deletion".
  The interface says so, and says explicitly that provider-managed backups
  follow their own retention and are not erased instantly.
- Deletion depends on the cron trigger being configured. A deployment without
  it will schedule jobs that never execute, which the preview-environment
  checklist covers.
- A one-month window means a scheduled deletion sits in the database for a
  month. That is deliberate — it is what makes the action recoverable — but it
  also means an operator reading the table sees pending jobs for far longer than
  the confirmation suggested.
