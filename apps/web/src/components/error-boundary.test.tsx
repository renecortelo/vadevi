import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { ErrorFallback } from "./ErrorBoundary";

/**
 * The screen a caught error is replaced with. Without an initialised
 * catalogue the strings render as their keys, which is enough to see which
 * ways out are offered for which failure.
 */
describe("the error fallback", () => {
  it("offers to try the screen again, to reload, and the way home", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ErrorFallback error={new RangeError("Invalid time value")} home reset={() => {}} />
      </MemoryRouter>,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("errorBoundary.title");
    expect(html).toContain("errorBoundary.body");
    expect(html).toContain("errorBoundary.retry");
    expect(html).toContain("errorBoundary.reload");
    expect(html).toContain("errorBoundary.home");
    // The error's own text stays in the console, not on the screen.
    expect(html).not.toContain("Invalid time value");
  });

  it("knows a chunk the deploy replaced, and offers only the reload that cures it", () => {
    const html = renderToStaticMarkup(
      <ErrorFallback
        error={new TypeError("Failed to fetch dynamically imported module: /assets/x.js")}
        reset={() => {}}
      />,
    );
    expect(html).toContain("errorBoundary.staleBody");
    expect(html).not.toContain("errorBoundary.retry");
    expect(html).toContain("errorBoundary.reload");
    expect(html).not.toContain("errorBoundary.home");
  });
});
