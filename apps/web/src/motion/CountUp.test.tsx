import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CountUp } from "./CountUp";
import { motionWelcome } from "./motion";

/**
 * A counting figure is decoration: the value itself is in the page from the
 * start, for screen readers and for a page rendered without a browser.
 */
describe("a figure that counts up", () => {
  it("renders its value, formatted, before any motion", () => {
    const html = renderToStaticMarkup(
      <CountUp format={(value) => new Intl.NumberFormat("es").format(value)} value={1234} />,
    );
    expect(html).toBe(
      '<span aria-hidden="true">1234</span><span class="sr-only">1234</span>'.replaceAll(
        "1234",
        new Intl.NumberFormat("es").format(1234),
      ),
    );
  });

  it("keeps an average's tenths", () => {
    expect(renderToStaticMarkup(<CountUp format={String} value={88.6} />)).toContain(
      '<span class="sr-only">88.6</span>',
    );
  });

  it("takes no answer about motion as a request for none", () => {
    expect(motionWelcome()).toBe(false);
  });
});
