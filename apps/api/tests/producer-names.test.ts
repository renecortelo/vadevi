import { describe, expect, it } from "vitest";

import { producerKey } from "../src/repositories/producer-names";

describe("one producer however it was written", () => {
  it("reads a house without the words that say what kind of house it is", () => {
    expect(producerKey("Bodegas Sumarroca")).toBe(producerKey("Sumarroca"));
    expect(producerKey("Celler Mas Doix")).toBe("mas doix");
    expect(producerKey("Domaine Leflaive")).toBe(producerKey("leflaive"));
    expect(producerKey("Weingut Dönnhoff")).toBe("donnhoff");
    expect(producerKey("Vega Sicilia S.A.")).toBe("vega sicilia");
    expect(producerKey("Grup Oliveda")).toBe("oliveda");
  });

  it("keeps a name that would be left too short, and keeps different houses apart", () => {
    expect(producerKey("Celler")).toBe("celler");
    expect(producerKey("Casa Madero")).toBe("casa madero");
    expect(producerKey("Bodegas Muga")).not.toBe(producerKey("Bodegas Mugartegui"));
  });
});
