import { describe, expect, it } from "vitest";

import { creditName } from "./image-credit";

describe("a photograph's credit", () => {
  it("keeps the name and drops Commons' notes around it", () => {
    expect(
      creditName(
        "No machine-readable author provided. Chateau bobal~commonswiki assumed (based on copyright claims).",
      ),
    ).toBe("Chateau bobal");
    expect(creditName("ÎµÎ³Ï Original uploader was Elisavetch at el.wikipedia")).toBe(
      "Elisavetch (el.wikipedia)",
    );
    expect(
      creditName(
        "Please note: This photo can be reproduced. Please quote the source as indicated below: Doris Schneider, Julius Kühn-Institut (JKI)",
      ),
    ).toBe("Doris Schneider, Julius Kühn-Institut (JKI)");
    expect(
      creditName(
        "Vermorel, Victor (1848-1927). Éditeur scientifique Viala, Pierre (1859-1936). Directeur de publication",
      ),
    ).toBe("Victor Vermorel, Pierre Viala");
    expect(creditName("Jules Troncy")).toBe("Jules Troncy");
  });
});
