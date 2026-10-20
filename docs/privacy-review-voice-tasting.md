# Privacy review: voice tastings (Workers AI speech-to-text)

§12.5 and §15.8 require a deployment-specific privacy review before an optional
AI provider is enabled. This document is that review for recording a tasting
by voice — planned, not yet built.

**This one deserves at least the scrutiny label reading had**, because it sends
a recording of the reader's own voice off the deployment, and a voice says more
than a label: who is speaking, and anyone talking nearby.

**Current state: built, off by default.** The switch, `STT_PROVIDER`,
defaults to `none` in `.dev.vars.example` and `wrangler.example.jsonc`,
separate from `AI_PROVIDER`, so enabling the assistant or label reading does
_not_ silently enable voice.

- Decision: ☑ approved ☐ rejected
- Decided by: the maintainer
- Date: 18 October 2026

This records the decision taken for the reference deployment, on the terms check
dated the same day and the real-voice tests of 16–18 October (`docs/backlog.md`,
P18). It is not a decision taken on your behalf: the box is here because §12.5
asks each deployment to make this call, and yours is still yours to make. If you
are reading this in a repository you cloned, the honest starting point is that
`STT_PROVIDER` is `none` and a recording goes nowhere.

## What the capability does

On the quick and the detailed tasting forms, and when adding a wine, a reader
may press a microphone button and describe the wine aloud. The recording is
sent to a Cloudflare Workers AI speech-to-text model
(`@cf/openai/whisper-large-v3-turbo`), which returns text. The reader can read
and correct that text. A second, separate step asks the deployment's language
model to propose form fields from it, each with the words of the transcript it
came from; a proposed value with no such words is discarded. Region and grape
are resolved against the library, not by the model. The proposal fills only
empty fields, and **nothing is saved until the reader saves the form as usual**.

**Dictation** (from 20 October 2026): every free-text note field — the
tasting notes, the quick log's comment, the taste profile's own words, an
event's description — has its own small microphone. It uses the same
speech-to-text step only: what was heard is written after what the field
already holds, as said, and no language model reads it. The audio is not
kept, as above; each dictation counts against the same daily voice allowance.

## What leaves the deployment

| Sent                                    | Notes                                                                                                                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The audio recording                     | At most two minutes, recorded only while the button is held on, in the browser's own format (webm/opus or mp4/aac). It carries the reader's voice and anything audible around them — a restaurant, other people. |
| A short vocabulary hint                 | Grape and region names from the library and a few tasting words in the reader's language, so the model spells "Mencía" or "taninos" right. Never the reader's notes, wines or any other data.                    |
| The transcript, for the extraction step | Sent to the deployment's language model (`AI_MODEL`) with a fixed instruction. The transcript is the reader's own description of a wine; it can contain anything they said.                                      |

What is **never** sent: user identity, Space identity, other tastings,
comments, prices, photographs, or any database row.

## The bystander problem

A microphone records the room. In a restaurant or at a tasting, other people's
voices — names, conversations — can end up in the recording and, if the model
transcribes them, in the text the reader sees. The reader decides when to
record and sees the transcript before anything is used, but the audio has
already left by then. Consider whether your members understand that before
enabling.

## Where the audio goes

Cloudflare Workers AI runs on Cloudflare's infrastructure, within the same
account boundary as the rest of the deployment; no other company receives the
recording. Before approving, check Cloudflare's current Workers AI terms on two
points and record the date here: whether inputs are retained, and whether they
are used to train models.

- Terms checked on: **2026-10-18**
- Source: <https://developers.cloudflare.com/workers-ai/platform/data-usage/>,
  which carries its own "last updated" date of 16 October 2026 — newer than the
  check recorded in the label-reading review, so it was read afresh, not
  carried over.
- **Retention of inputs:** none for this use. The page calls it "zero data
  retention": for standard inference Cloudflare "does not retain inputs or
  outputs after they are no longer needed to process the request and deliver
  the response". Storage happens only where the deployment directs it (R2, KV,
  AI Gateway logging, its own logs); this application uses none of those for
  voice. Operational metadata (model, timings, sizes, Neurons) is kept and
  contains no content. Content may be kept where the law requires it, and is
  then not used for training either.
- **Use for training:** none. Cloudflare "does not use Customer Content
  processed by Workers AI to train AI models", and does not make it available
  to other customers. Whisper and Llama are third-party models under their own
  licences; Cloudflare runs them and does not train them.

The browser's own speech recognition (the Web Speech API) was considered and
rejected: depending on the browser it sends the voice to Google or Apple, and
it is not available everywhere.

## What the application stores

- **Not stored**: the audio (processed in memory and discarded), the
  transcript, the vocabulary hint, the raw model responses, and any discarded
  proposal — unless the reader sends that note for review (below).
- **Stored only if the reader sends a note for review**: beside the result, a
  button, "Send this note to improve voice", that the reader presses for one
  note at a time. It keeps, in the deployment's own database
  (`voice_reviews`), the transcript as the reader corrected it, what the app
  proposed (with the words each value came from), the form as the reader left
  it, the form's kind and the language. **Never the audio.** Each row is
  removed thirty days after it was sent by the scheduled handler, and at once
  with the Space or the account it belongs to; a member may send thirty a day.
  It exists so the deployment's operator can read real notes and correct the
  extraction — read by hand, with a database query, and never sent anywhere
  else. The transcript may contain whatever was said, bystanders included:
  the hint beside the button says what is kept and for how long. Approved
  with the rest of this review on 18 October 2026. Not in the data export:
  it is diagnostic and gone within thirty days.
- **Stored only if the reader saves**: the tasting fields they kept, as an
  ordinary tasting note, marked `creation_method = 'audio'` — a neutral record
  of how it was first written, shown as a small microphone. It implies nothing
  about the note's quality and is never cleared by editing.
- **Metrics**: counts and timings only — success or failure per stage, seconds
  of audio, fields proposed, accepted and discarded. Never the audio or any
  text.

## Hostile-content handling

A transcript is user-controlled text that will reach a language model. It goes
through the same `sanitizeExternalText` boundary label text does, the
extraction instruction is fixed, and the model's answer is accepted only as a
typed proposal checked against a schema and against the transcript itself: a
value is kept only if the words it came from are in the transcript, and only
the form's own fields and options are accepted.

## Limits and cost

- Measured on 16 October 2026 (`docs/backlog.md`, P18): 22 seconds of speech
  transcribed in 1–4 seconds, two minutes in under 9 seconds. Cloudflare lists
  the model at about $0.0005 a minute of audio.
- Daily caps, enforced before the call, in `dailyBudgets` and the table in
  `docs/self-hosting.md`: `voice_transcriptions` (ten a member, fifteen for
  the deployment, each at most two minutes), and the extraction step counts
  against `ai_language_calls` like an assistant reply. At the cap the button
  says so and the form works by hand.
- **The Workers AI free allocation is one shared pool.** Transcription and the
  extraction step draw on the same daily allowance as the assistant and label
  reading. Size the caps to the plan before enabling.

## Honest assessment of value

Tested on 16 October 2026 with 40 real recordings, five in each of the app's
languages (`docs/backlog.md`, P18). The model heard the language right every
time. Spanish and English came out very well, Italian well and German
acceptably; Catalan and Portuguese often misheard wine names, and French and
Dutch looped on a phrase in four recordings until voice detection was switched
on, which the adapter now does. Names are spelled right when the vocabulary
hint contains them and wrong when it does not, so the extraction step has to
match approximate names against the library. Treat it as a typing shortcut:
the reader reviews every field before saving.

## Recommendation

Approving this is defensible **if** the terms check above comes back clean,
real-voice tests in your members' languages are acceptable, and your members
understand that recordings leave the deployment and may include other voices.

If you want tastings without that disclosure, reject this review: the forms
work as they do today, typed, with nothing sent anywhere.

## How to enable

Only after the decision and the terms check above are recorded, and once the
feature is built:

```
STT_PROVIDER=cloudflare
AI_PROVIDER=cloudflare
```

Plus an `AI` binding in your Wrangler configuration.

## How to disable

Set `STT_PROVIDER=none` and redeploy. No recording is retained, and notes sent
for review are removed within thirty days (at once with
`DELETE FROM voice_reviews`); tastings already saved keep their
microphone, which only records how they were first written.
