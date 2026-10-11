import { describe, expect, it } from "vitest";

import { readSheet, sheetDate } from "./xlsx";

/** A zip of uncompressed files, as small as the reader needs. */
function zip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint32(18, data.length, true);
    localView.setUint32(22, data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint32(20, data.length, true);
    centralView.setUint32(24, data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const directorySize = centrals.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, centrals.length, true);
  endView.setUint16(10, centrals.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let position = 0;
  for (const part of parts) {
    out.set(part, position);
    position += part.length;
  }
  return out;
}

describe("readSheet", () => {
  it("reads shared and inline text, numbers and hyperlinks", () => {
    const file = zip({
      "xl/sharedStrings.xml":
        "<sst><si><t>GI Name</t></si><si><t>Hawke’s Bay / Hawkes Bay</t></si></sst>",
      "xl/worksheets/_rels/sheet1.xml.rels":
        '<Relationships><Relationship Id="rId1" Target="https://example.org/?a=1&amp;b=2"/></Relationships>',
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>43157.0</v></c>' +
        '<c r="C2" t="inlineStr"><is><t>Wine</t></is></c></row></sheetData>' +
        '<hyperlinks><hyperlink ref="A2" r:id="rId1"/></hyperlinks></worksheet>',
    });
    expect(readSheet(file)).toEqual([
      { A: { value: "GI Name" } },
      {
        A: { link: "https://example.org/?a=1&b=2", value: "Hawke’s Bay / Hawkes Bay" },
        B: { value: "43157.0" },
        C: { value: "Wine" },
      },
    ]);
  });
});

describe("sheetDate", () => {
  it("reads a spreadsheet's day number as a date", () => {
    expect(sheetDate("43157.0")).toBe("2018-02-26");
    expect(sheetDate("42943")).toBe("2017-07-27");
  });

  it("gives nothing for an empty cell", () => {
    expect(sheetDate("")).toBeNull();
  });
});
