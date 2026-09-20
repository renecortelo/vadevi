# UI conventions

What the interface holds itself to, so a new screen lands looking like the
rest. The tokens live in `packages/ui/src/styles/tokens.css` and the rules in
`apps/web/src/styles/global.css`; this page is the reasoning, not a second
copy of the values.

## Type

Five sizes, one body line height. `--text-xs` (13px, captions and eyebrows —
never smaller), `--text-sm` (labels, secondary lines), `--text-base` (body,
including Vicenç's replies), `--text-md` (subsection headings, the line under
a screen title, the value on a highlight card), `--text-lg` (card and section
headings, `h2`, legends). The screen title, `--text-xl`, clamps between 1.75
and 2.5rem: this is an application, and a title that pushes the first field
below the fold on a laptop is a landing page's title.

Display serif for `h1`–`h3` and legends; the body sans for everything that is
read rather than glanced at. A reply, a note, a paragraph of evidence is body
text at body size.

## Colour

Two palettes, each checked for contrast in `packages/ui/tests/contrast.test.ts`:
4.5:1 for every text pair, 3:1 for every field border against the surface it
sits on. Add a pair to the test when you add a pair to the interface.

- Muted text is for what names or annotates: labels, captions, eyebrows, the
  sentence under a title. What the reader wrote or asked for is full ink.
- The success green is a status ("saved on this device"), never a hint. A hint
  is muted text.
- The danger red outlines a destructive button; it never fills one.

## Fields

A field must read as a field: `--color-field` is one step apart from the card
it sits on, its border meets 3:1, it darkens under the pointer and shows a ring
on focus. Labels are muted, medium weight, small, one step above the box; the
value in the box is full ink at medium weight. A form is boxes with names, not
a column of headings.

Long forms are cut into named runs with `.form-group` and an `h3`: the
tasting's context step is four of them — the bottle, the place, the room, the
table — rather than thirty fields in one ladder.

## Buttons

One button, `.action-link`, in four weights: `--primary` (filled, one per
view at most), `--secondary` (outlined), `--quiet` (ghost, for the rest of a
row), `--danger` (outlined red). Every one is at least 44px tall, answers the
pointer, presses on click, and reads as refused when disabled. A row of
actions on a card uses one shape for all of them.

Underlined `.text-button` and `.text-link` are for inline asides — "discard",
"read" — and are 36px tall so a thumb still finds them.

## Cards

A wine card is built around a portrait: the photo is a tall column at the
left, the text beside it, like a bottle on a shelf with its card. Its line
under the name reads vintage · type · region. Its actions are one row of
secondary buttons — taste, edit, evidence, and the tastings behind their
count, which opens a list of bordered rows. A place's name is the link to the
map (`.venue-link`, with a pin); there is no "open in Google Maps" text
beside it, and the card itself carries no map link — each tasting does.

Every screen opens the same way, `.page-heading`: eyebrow, title, one
sentence, at the same distances from the same top edge, whatever the
container.

## Forms

A long form is short runs, each under a title: `form-group` with an `h3`,
divided from the last by a rule. Every step of the deep tasting is built
that way — in the glass / memory cues; as poured / after swirling / memory
cues; the bead (sparkling only) / structure / flavour and finish / memory
cues; the bottle / the place / the room / the table; your verdict / value and
expectation / in your own words. The bar of actions that follows the form
is a card like the sections above it, not a strip.

## Layout

Phone first: 320px is the narrowest supported width, and the e2e suite fails
on any horizontal overflow there. On a phone the Space switcher takes a row
of its own, five step tabs scroll sideways, the view switcher wraps three to
a row, and a primary submit is full width; on a laptop the same submit is a
button, not a banner.

## Failure

A screen that throws is replaced, not the app: every deferred screen sits in
an `ErrorBoundary` inside the shell, and one more wraps the whole tree.
`ErrorFallback` names what happened in the reader's language, moves focus
to its heading, and offers "Try again", "Reload" and — inside the shell —
"Back to start"; a chunk the deploy replaced under an open tab is recognised
and offered only the reload that cures it. The error's text goes to the
console and nowhere else. Form fields never throw on their way to the
record: a `datetime-local` field goes through `lib/local-date-time.ts`, which
answers null for a cleared or half-typed value, and the field keeps what it
had.

## Reviewing

`UX_SHOTS=1 pnpm exec playwright test e2e/ux-shots.spec.ts --project=chromium-desktop`
renders every screen at 1280 and 390px in both palettes into `.ux-shots/`.
That contact sheet is what a design review looks at; it is how the pass of
19 September 2026 was done.
