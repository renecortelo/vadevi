import { inflateRawSync } from "node:zlib";

/**
 * Just enough of a spreadsheet reader for a register's export: the first
 * sheet's cells as text, by column letter, and each cell's hyperlink. An .xlsx
 * file is a zip of XML parts; this reads the zip's central directory and
 * inflates the three parts it needs.
 */
function zipEntries(zip: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // The end-of-central-directory record, searched for from the end.
  let end = zip.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("Not a zip file.");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries = new Map<string, Uint8Array>();
  for (let index = 0; index < count; index += 1) {
    const method = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(zip.subarray(offset + 46, offset + 46 + nameLength));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = zip.subarray(start, start + size);
    entries.set(name, method === 8 ? inflateRawSync(data) : data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

const unescape = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");

export type Cell = { link?: string; value: string };

/** The first sheet's rows, each a map from column letter to cell. */
export function readSheet(file: Uint8Array): Record<string, Cell>[] {
  const entries = zipEntries(file);
  const part = (name: string) => {
    const data = entries.get(name);
    return data === undefined ? "" : new TextDecoder().decode(data);
  };
  const shared = [...part("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map(
    ([, item]) =>
      unescape([...item!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(([, t]) => t).join("")),
  );
  const sheet = part("xl/worksheets/sheet1.xml");
  const targets = new Map(
    [...part("xl/worksheets/_rels/sheet1.xml.rels").matchAll(/<Relationship ([^>]*)\/?>/g)].map(
      ([, attributes]) => [
        /Id="([^"]+)"/.exec(attributes!)?.[1] ?? "",
        unescape(/Target="([^"]+)"/.exec(attributes!)?.[1] ?? ""),
      ],
    ),
  );
  const links = new Map(
    [...sheet.matchAll(/<hyperlink ([^>]*)\/?>/g)].map(([, attributes]) => [
      /ref="([^"]+)"/.exec(attributes!)?.[1] ?? "",
      targets.get(/r:id="([^"]+)"/.exec(attributes!)?.[1] ?? "") ?? "",
    ]),
  );
  const rows: Record<string, Cell>[] = [];
  for (const [, row] of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: Record<string, Cell> = {};
    for (const [, attributes, body] of row!.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const reference = /r="([A-Z]+)(\d+)"/.exec(attributes!);
      if (reference === null) continue;
      const type = /t="([^"]+)"/.exec(attributes!)?.[1];
      const raw =
        /<v>([\s\S]*?)<\/v>/.exec(body ?? "")?.[1] ??
        /<t[^>]*>([\s\S]*?)<\/t>/.exec(body ?? "")?.[1];
      const value =
        raw === undefined ? "" : type === "s" ? (shared[Number(raw)] ?? "") : unescape(raw);
      const link = links.get(`${reference[1]}${reference[2]}`);
      cells[reference[1]!] = link === undefined ? { value } : { link, value };
    }
    rows.push(cells);
  }
  return rows;
}

/** A spreadsheet's day number (days since 30 December 1899) as an ISO date. */
export function sheetDate(serial: string): string | null {
  const days = Number(serial);
  if (!Number.isFinite(days) || days <= 0) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(days) * 86_400_000)
    .toISOString()
    .slice(0, 10);
}
