import { describe, expect, it } from "vitest";

import type {
  BootstrapResponse,
  CreateResearchJobRequest,
  TastingSessionDetailResponse,
  WineSummary,
} from "../src/index";

/**
 * The contract types must actually be types.
 *
 * `@hono/zod-openapi@1.5.2` shipped a declaration file referring to a `zodModule`
 * it never imported. With `skipLibCheck` on — which every package here uses — that
 * is not an error: TypeScript quietly types the whole module as `any`, so `z` was
 * `any`, every schema built from it was `any`, and every type inferred from those
 * schemas was `any` too.
 *
 * Nothing failed. `pnpm typecheck` passed on code assigning a string to a number,
 * and it hid a real defect for weeks: a pairing suggestion read a property its
 * object never had, so the reader's tasting notes never reached it.
 *
 * These assertions are compile-time. If a dependency ever degrades the inference
 * again, `IsAny` flips to `true`, the `false` annotation stops compiling, and the
 * typecheck fails here with this comment attached — rather than everywhere and
 * nowhere, months later.
 */
type IsAny<T> = 0 extends 1 & T ? true : false;

const wineSummaryIsAny: IsAny<WineSummary> = false;
const bootstrapIsAny: IsAny<BootstrapResponse> = false;
const sessionDetailIsAny: IsAny<TastingSessionDetailResponse> = false;
const researchRequestIsAny: IsAny<CreateResearchJobRequest> = false;

/** A required field really is required, not merely declared. */
type MissingRequiredField = { displayName: string };
type RejectsIncompleteWine = MissingRequiredField extends WineSummary ? true : false;
const incompleteWineIsAccepted: RejectsIncompleteWine = false;

describe("the contract types survive the toolchain", () => {
  it("infers real types rather than collapsing to any", () => {
    // The assertions above are the test; TypeScript checks them. This body keeps
    // the file honest for the runner, and fails loudly if one is ever flipped to
    // `true` to make a build pass.
    expect([
      wineSummaryIsAny,
      bootstrapIsAny,
      sessionDetailIsAny,
      researchRequestIsAny,
      incompleteWineIsAccepted,
    ]).toEqual([false, false, false, false, false]);
  });
});
