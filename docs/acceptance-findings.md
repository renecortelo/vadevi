# Acceptance findings

What the manual runs in `docs/manual-acceptance.md` actually found, and what was
done about it. Kept because a fixed defect is only evidence if the fix is
attached to the report that produced it.

---

## Round 1 — 16 August 2026, René Cortés, Google Chrome, desktop

Mobile was not exercised. Items 1–8 of that run passed; the run stopped at the
identification step.

### 1. The wordmark was still the old serif "Va de Vi"

**Reported:** "The current deploy shows the system/light/dark… Logos are still
out."

**Cause:** two separate defects behind one symptom.

- The desktop shell drew the brand from a CSS pseudo-element,
  `.primary-nav::before { content: "Va de Vi" }`, which sat on top of the real
  wordmark and hid it at wide viewports. The brand work replaced the element it
  could see and never the string in the stylesheet. Text in `content` is also
  invisible to translation and inconsistently exposed to assistive technology,
  so it should not have been carrying a brand name in the first place.
- The application icon had been redeployed correctly but drew badly: the two
  V-shapes overlapped enough to read as a single W.

**Fixed:** the wordmark is now one real element that moves into the navigation
column on wide viewports, and the pseudo-element is gone. The icon was redrawn
with the two letterforms separated and checked by rendering it, not by reading
the path data.

### 2. The navigation rail was unreadable in dark mode

**Reported:** "in the left pane, when dark, nothing is readable, colors are
similar."

**Cause:** `.primary-nav` painted itself with a literal `rgb(255 250 244 / 92%)`,
so it stayed a light surface while the text inverted around it. Auditing the
stylesheet for the same mistake found **32 hardcoded colours** in total.

**Fixed:** every one of them now resolves through a token that both palettes
declare, with new tokens added where the palettes had no equivalent. The one
literal deliberately left is the Google brand blue on its white sign-in mark,
which is not ours to theme.

A contrast test covers the pairs the interface renders in both palettes, so this
class of defect fails a build rather than a run.

### 3. Identification was unreachable

**Reported:** "couldn't find **identify** anywhere. If you meant **Wine
Identity** the section, then if I type part of the producer nothing happens."

**Cause:** the screen existed and worked, and nothing linked to it. What was
found instead was the manual identity fieldset on the Quick Log screen, which is
a different thing that happens to be named similarly.

**Fixed:** entry points added on the home screen and inside the Quick Log
identity block. An end-to-end test now walks to the screen by clicking from
both, so a reachable-only-by-URL screen fails a build.

### Raised separately in the same session, not from the script

- **No way to change the interface language after onboarding.** The language was
  asked once, at first run, and then fixed for the life of the account. Added a
  language menu to the top bar, saved to the account like the theme. Worth
  stating plainly, because the report also expected a Space's locale to change
  it: the two are separate on purpose. A Space's default locale describes the
  Space; the interface language describes the reader, and one member switching
  Space must not restyle the interface for what another member chose.
- **Wine Memory filters crowded out the wines.** Eleven controls sat above the
  results. They now collapse behind a disclosure, with free-text search left
  open and a count of active filters shown even when the panel is closed.
- **The top bar ate nearly half a phone screen**, and the theme control was
  hidden below 640px entirely — so the control the report asked for did not
  exist on the device where it matters most. Both fixed: the controls wrap along
  a row instead of stacking, and neither is hidden.
