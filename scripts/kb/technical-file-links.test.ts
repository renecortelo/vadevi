import { describe, expect, it } from "vitest";

import { fileLines, technicalFileLink } from "./technical-file-links";

/**
 * A page as Ghostscript's character-level XML gives it: each line a run of
 * characters, each with its place. Characters are spread evenly over the
 * line's width, as near as a test needs.
 */
type Line = { font?: string; size?: number; text: string; x?: number; x1?: number; y: number };

function page(lines: Line[]): string {
  return `<page>\n${lines
    .map(({ font = "ArialMT", size = 12, text, x = 78, x1, y }) => {
      const right = x1 ?? x + text.length * 6;
      const step = text.length === 0 ? 0 : (right - x) / text.length;
      const chars = [...text]
        .map((char, index) => {
          const left = Math.round(x + index * step);
          const escaped = char.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
          return `<char bbox="${left} ${y} ${left + 5} ${y}" c="${escaped}"/>`;
        })
        .join("\n");
      return `<block>\n<line>\n<span bbox="${x} ${y} ${right} ${y}" font="ABCDEF+${font}-Identity-H" size="${size}">\n${chars}\n</span>\n</line>\n</block>`;
    })
    .join("\n")}\n</page>\n`;
}

const form = (text: string, y: number, size = 16.3575): Line => ({
  font: "TimesNewRomanPSMT",
  size,
  text,
  x: 40,
  y,
});

const right = 518;
const first =
  "The demarcated area lies on the southern slopes of the valley, where a temperate climate";
const second =
  "and limestone soils favour a slow and complete ripening of the grapes, year after year.";
const third =
  "The vineyards are planted on terraces cut into the hillside, between 200 and 600 metres.";

describe("a technical file's link with the geographical area", () => {
  it("reads the seventh section of the form, not its labels or its running head", () => {
    const xml = page([
      { font: "Helvetica", text: "6 /10", x: 240, y: 33 },
      { size: 14, text: "TECHNICAL FILE", x: 36, y: 35 },
      form("6. MAIN WINE GRAPES", 74),
      { text: "Pinot Noir N", y: 100 },
      form("7. DESCRIPTION OF THE LINK(S)", 140),
      form("Details of the geographical area:", 160, 14.3),
      { text: first, x1: right, y: 180 },
      { text: second, x1: right - 20, y: 192 },
      { text: third, x1: right - 10, y: 204 },
      form("8. FURTHER CONDITIONS", 260),
      {
        text: "None at all, so nothing more is said of the link in this part of the form.",
        y: 280,
      },
    ]);
    expect(technicalFileLink(fileLines(xml))).toBe(`${first} ${second} ${third}`);
  });

  it("reads the eighth in the form whose first sections are the name and its kind", () => {
    const xml = page([
      form("1. NAME(S) TO BE REGISTERED", 60, 13.3),
      form("7. MAIN WINE GRAPES", 80, 13.3),
      { font: "TimesNewRomanPSMT", text: "Zweigelt", y: 100 },
      form("8. DESCRIPTION OF THE LINK(S)", 140, 13.3),
      { font: "TimesNewRomanPSMT", text: first, x1: right, y: 160 },
      { font: "TimesNewRomanPSMT", text: second, x1: right - 20, y: 178 },
      { font: "ArialMT", size: 8, text: "Created on 02-08-2016 11:10:00", x: 43, y: 805 },
      { font: "ArialMT", size: 8, text: "1 / 9", x: 531, y: 805 },
      form("9. FURTHER CONDITIONS", 200, 13.3),
    ]);
    expect(technicalFileLink(fileLines(xml))).toBe(`${first} ${second}`);
  });

  it("puts a superscript back after the number it is raised from", () => {
    const host =
      "The vineyards lie on slopes of 20  to 30 , with many ravines and ridges across the whole";
    // Where a character of the host line stands, as the page above spreads them.
    const at = (index: number) => Math.round(78 + (index * (right - 78)) / host.length);
    // The text layer sets each "o" a little after its number: after "20 ", after "30 ,".
    const after20 = host.indexOf("20 ") + 3;
    const after30 = host.indexOf("30 ,") + 4;
    const xml = page([
      form("7. LINK", 100),
      { text: host, x1: right, y: 140 },
      { text: "o", x: at(after20), x1: at(after20) + 5, y: 134 },
      { text: "o", x: at(after30), x1: at(after30) + 5, y: 134 },
      {
        text: "area, which keeps the yields low and the grapes small and full of flavour every year.",
        y: 152,
      },
    ]);
    expect(technicalFileLink(fileLines(xml))).toContain("slopes of 20o to 30o, with many ravines");
  });

  it("joins the pieces one printed line comes out in", () => {
    const xml = page([
      form("7. LINK", 100),
      { text: "α. Ποιότητα", x1: 132, y: 130 },
      { text: "Στις αρχές του 20ου ", x1: 148, y: 142 },
      {
        text: "αιώνα, η σταδιακή ανάπτυξη των οινοποιείων στο νησί αποτέλεσε σταθμό για τις σύγχρονες",
        x: 148,
        x1: right,
        y: 142,
      },
      {
        text: "εξελίξεις του κρασιού, που κράτησαν ζωντανή την αμπελοκαλλιέργεια στο νησί ως σήμερα.",
        y: 154,
      },
    ]);
    expect(technicalFileLink(fileLines(xml))).toMatch(/^Στις αρχές του 20ου αιώνα, η σταδιακή/);
  });

  it("leaves out a title, and never opens mid-sentence", () => {
    const xml = page([
      form("7. LINK", 100),
      { text: "a) - Description of the natural factors contributing to the link", x1: 375, y: 130 },
      { text: first, x1: right, y: 148 },
      { text: second, x1: 300, y: 160 },
      { text: "1) Human factors", x1: 160, y: 190 },
      {
        text: "keep the old terraces in good repair, as their parents and grandparents did before them.",
        y: 202,
      },
    ]);
    expect(technicalFileLink(fileLines(xml))).toBe(`${first} ${second}`);
  });

  it("keeps whole sentences where the last one has lost its full stop", () => {
    const xml = page([
      form("7. LINK", 100),
      { text: first, x1: right, y: 130 },
      { text: `${second} The terraces lie between 200 and 600`, x1: right - 5, y: 142 },
      { text: "metres", x1: 120, y: 154 },
    ]);
    expect(technicalFileLink(fileLines(xml))).toBe(`${first} ${second}`);
  });

  it("gives nothing where the section is missing", () => {
    expect(technicalFileLink(fileLines(page([form("6. GRAPES", 100)])))).toBeNull();
  });
});
