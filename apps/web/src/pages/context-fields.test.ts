import { describe, expect, it } from "vitest";

/**
 * The shape of the bug that made the venue field look read-only.
 *
 * `updateContext` built the next context from the draft as it was when the
 * render ran, so two calls in one handler did not set two fields: the second
 * started from the same stale draft and overwrote the first. Picking a venue set
 * six fields, and the coordinate written last discarded the name written first —
 * so typing appeared to do nothing at all.
 *
 * These tests pin both halves: that the broken pattern really does lose the
 * earlier write, and that merging inside the state updater does not.
 */

type Context = Record<string, unknown>;
type Draft = { payload: { context?: Context } };

/** The old, wrong shape: each call reads the draft captured at render time. */
function staleUpdater(draft: Draft, setDraft: (next: Draft) => void) {
  return (key: string, value: unknown) => {
    const context = { ...(draft.payload.context ?? {}) };
    if (value === undefined) delete context[key];
    else Object.assign(context, { [key]: value });
    setDraft({ ...draft, payload: { ...draft.payload, context } });
  };
}

/** The shape in use now: the merge happens inside the state updater. */
function mergingUpdater(store: { current: Draft }) {
  return (fields: Context) => {
    const context = { ...(store.current.payload.context ?? {}) };
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) delete context[key];
      else Object.assign(context, { [key]: value });
    }
    store.current = { ...store.current, payload: { ...store.current.payload, context } };
  };
}

describe("setting several tasting-context fields at once", () => {
  it("loses the earlier field when each call rebuilds from the render's draft", () => {
    const rendered: Draft = { payload: { context: {} } };
    let latest: Draft = rendered;
    const update = staleUpdater(rendered, (next) => {
      latest = next;
    });

    // What choosing a venue used to do: one call per field, in one handler.
    update("venueName", "Can Pau");
    update("venueLatitude", 41.385123);

    // The name is gone — which is exactly what the reader saw when they typed.
    expect(latest.payload.context).toEqual({ venueLatitude: 41.385123 });
    expect(latest.payload.context?.venueName).toBeUndefined();
  });

  it("keeps every field when the merge happens inside the updater", () => {
    const store = { current: { payload: { context: {} } } as Draft };
    const updateFields = mergingUpdater(store);

    updateFields({
      venueArea: "El Born",
      venueCity: "Barcelona",
      venueCountryCode: "ES",
      venueLatitude: 41.385123,
      venueLongitude: 2.1734,
      venueName: "Can Pau",
    });

    expect(store.current.payload.context).toEqual({
      venueArea: "El Born",
      venueCity: "Barcelona",
      venueCountryCode: "ES",
      venueLatitude: 41.385123,
      venueLongitude: 2.1734,
      venueName: "Can Pau",
    });
  });

  it("renames a place without dropping the point it was given", () => {
    const store = {
      current: {
        payload: {
          context: {
            venueLatitude: 41.385123,
            venueLongitude: 2.1734,
            venueName: "Carrer del Rec",
          },
        },
      } as Draft,
    };
    const updateFields = mergingUpdater(store);

    // Typing in the field renames and nothing else, so a reader who took their
    // position and then called the place "la terraza de Marta" keeps the point.
    updateFields({ venueName: "La terraza de Marta" });

    expect(store.current.payload.context).toEqual({
      venueLatitude: 41.385123,
      venueLongitude: 2.1734,
      venueName: "La terraza de Marta",
    });
  });

  it("clears a field asked for as undefined without touching its neighbours", () => {
    const store = {
      current: { payload: { context: { venueCity: "Barcelona", venueName: "Can Pau" } } } as Draft,
    };
    mergingUpdater(store)({ venueCity: undefined });

    expect(store.current.payload.context).toEqual({ venueName: "Can Pau" });
  });
});
