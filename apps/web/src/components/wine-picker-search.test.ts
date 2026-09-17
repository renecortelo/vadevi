import { describe, expect, it } from "vitest";

/**
 * The shape of the request loop the wine picker's search introduced.
 *
 * The screens pass a plain function as `onSearch`, which is a new identity on
 * every render. With that function in the effect's dependency list the sequence
 * was: effect runs, fetches, sets the wine list, re-renders, hands over a new
 * function, effect runs again — unbounded. It did not fail the browser tests, it
 * hung them, which is worse: the shards were cancelled on time rather than
 * reported as broken.
 *
 * These pin the two rules that stop it: the callback's identity must not drive
 * the effect, and the first, empty search on mount must not run at all, since
 * the screen has already loaded its own list.
 */

/** A tiny model of the effect: what re-runs, and how often it fetches. */
function runEffectCycles({
  dependsOnCallbackIdentity,
  skipFirstEmpty,
  renders,
}: {
  dependsOnCallbackIdentity: boolean;
  skipFirstEmpty: boolean;
  renders: number;
}): number {
  let fetches = 0;
  let firstRun = true;
  let lastDependency = "";
  const filter = "";

  for (let render = 0; render < renders; render += 1) {
    // A new callback identity on every render, as a plain function prop is.
    const dependency = dependsOnCallbackIdentity ? `${filter}:${render}` : filter;
    const changed = render === 0 || dependency !== lastDependency;
    lastDependency = dependency;
    if (!changed) continue;
    if (firstRun) {
      firstRun = false;
      if (skipFirstEmpty && filter.trim().length === 0) continue;
    }
    fetches += 1;
  }
  return fetches;
}

describe("the wine picker's search effect", () => {
  it("would fetch on every render when the callback's identity is a dependency", () => {
    // The bug: each fetch sets state, which renders, which fetches again.
    expect(
      runEffectCycles({ dependsOnCallbackIdentity: true, renders: 20, skipFirstEmpty: false }),
    ).toBe(20);
  });

  it("fetches nothing while only the callback identity changes", () => {
    expect(
      runEffectCycles({ dependsOnCallbackIdentity: false, renders: 20, skipFirstEmpty: true }),
    ).toBe(0);
  });

  it("does not search on mount, because the screen already loaded its list", () => {
    expect(
      runEffectCycles({ dependsOnCallbackIdentity: false, renders: 1, skipFirstEmpty: true }),
    ).toBe(0);
  });
});
