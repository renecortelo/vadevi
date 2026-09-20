/**
 * JSON with comments and trailing commas, as Wrangler reads its configuration.
 *
 * Just enough of a reader to hand the file to JSON.parse: comments are
 * removed outside strings only — a `//` inside "https://…" is part of the
 * value — and a comma before a closing bracket is dropped. Everything else
 * is JSON's problem, and JSON.parse reports it.
 */
export function parseJsonc(text: string): unknown {
  let out = "";
  let index = 0;
  while (index < text.length) {
    const character = text[index]!;
    const next = text[index + 1];
    if (character === '"') {
      // A string, verbatim, escapes included.
      let end = index + 1;
      while (end < text.length && text[end] !== '"') {
        if (text[end] === "\\") end += 1;
        end += 1;
      }
      out += text.slice(index, end + 1);
      index = end + 1;
    } else if (character === "/" && next === "/") {
      const end = text.indexOf("\n", index);
      index = end === -1 ? text.length : end;
    } else if (character === "/" && next === "*") {
      const end = text.indexOf("*/", index + 2);
      index = end === -1 ? text.length : end + 2;
    } else {
      out += character;
      index += 1;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}
