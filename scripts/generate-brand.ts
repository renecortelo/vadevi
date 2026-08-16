import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Generates every brand asset from one description of the artwork.
 *
 * The marks were previously drawn by hand, one file at a time, and drifted: the
 * icon's two letterforms overlapped into a W without anyone noticing, and the
 * wordmark rendered in whatever the system sans happened to be. Both are
 * described here instead, so the letterforms in the top bar, the sign-in lockup
 * and the installed icon are the same geometry rather than three attempts at it.
 *
 * The typography is a geometric grotesque built from circles and straight
 * strokes, which is what the source artwork is. Building it here rather than
 * loading a webfont keeps the mark identical everywhere and costs no bytes: the
 * content security policy forbids external font hosts, and a self-hosted face
 * would weigh more than the six letters it would draw.
 *
 * Run with `pnpm brand:generate`. The output is committed; the checked-in files
 * are the ones the application ships.
 */

// ---------------------------------------------------------------------------
// Palette, sampled from the source artwork.
// ---------------------------------------------------------------------------

const wine = "#8b1116";
const wineDeep = "#7a0e13";
const cream = "#fbeee5";

/** Bottle tints on the wine ground, left to right, as in the dark lockup. */
const bottlesOnWine = ["#e04a42", "#cf3b3c", "#e8574a", "#de5265", "#d9524f", "#de3a34", "#a52247"];

/** Bottle tints on the cream ground, from the light lockup. */
const bottlesOnCream = [
  "#f0917c",
  "#ee5f5c",
  "#f5b9ab",
  "#f0918f",
  "#e57a94",
  "#ef8b71",
  "#f09a86",
];

// ---------------------------------------------------------------------------
// Letterforms.
// ---------------------------------------------------------------------------

/** x-height. Every other measure is expressed against it. */
const xHeight = 100;
/** Stroke weight, measured across the stroke. */
const weight = 26;
/** How far `d` and the dot of `i` rise above the x-height. */
const ascender = 42;
/** Space between advances. Tight, matching the artwork. */
const tracking = 8;

const radius = xHeight / 2;
/** Radius of the stroke's centre line, which is what a stroked circle follows. */
const ringRadius = radius - weight / 2;

/** A drawing instruction. Stroked shapes carry their width; the rest are filled. */
type Shape = { d: string; stroke?: number };
type Glyph = { advance: number; shapes: Shape[] };

function n(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The ring shared by `a`, `d` and `e`, as a stroked circle. */
function ring(ox: number): Shape {
  const cx = ox + radius;
  const r = ringRadius;
  return {
    d: `M ${n(cx - r)} ${radius} a ${r} ${r} 0 1 0 ${r * 2} 0 a ${r} ${r} 0 1 0 ${-r * 2} 0`,
    stroke: weight,
  };
}

function bar(x: number, y: number, w: number, h: number): Shape {
  return { d: `M ${n(x)} ${n(y)} h ${n(w)} v ${n(h)} h ${n(-w)} Z` };
}

/**
 * `v`, drawn as a filled outline rather than a stroke so the two tops can be cut
 * flat along the x-height line, as the artwork cuts them.
 */
function vee(ox: number): Glyph {
  const advance = 100;
  const half = advance / 2;
  // A slanted stroke is wider measured horizontally than measured across it.
  const horizontal = weight / Math.cos(Math.atan(half / xHeight));
  // Where the two inner edges meet, which is how deep the counter runs.
  const apex = xHeight - 2 * horizontal;
  return {
    advance,
    shapes: [
      {
        d:
          `M ${ox} 0 L ${ox + half} ${xHeight} L ${ox + advance} 0 ` +
          `L ${n(ox + advance - horizontal)} 0 L ${ox + half} ${n(apex)} ` +
          `L ${n(ox + horizontal)} 0 Z`,
      },
    ],
  };
}

function ay(ox: number): Glyph {
  return { advance: 100, shapes: [ring(ox), bar(ox + 100 - weight, 0, weight, xHeight)] };
}

function dee(ox: number): Glyph {
  return {
    advance: 100,
    shapes: [ring(ox), bar(ox + 100 - weight, -ascender, weight, xHeight + ascender)],
  };
}

/**
 * `e`: the ring opened at the lower right, plus a crossbar flush with the right
 * edge. The arc runs the long way round from the bar's level, so the aperture is
 * the gap between the two and the stroke's butt cut becomes the terminal.
 */
function ee(ox: number): Glyph {
  const crossbar = weight * 0.85;
  const cx = ox + radius;
  const r = ringRadius;
  const aperture = (28 * Math.PI) / 180;
  return {
    advance: 100,
    shapes: [
      {
        d:
          `M ${n(cx + r)} ${radius} A ${r} ${r} 0 1 0 ` +
          `${n(cx + r * Math.cos(aperture))} ${n(radius + r * Math.sin(aperture))}`,
        stroke: weight,
      },
      // Slightly lighter than the stem, as a bold geometric face draws it, or
      // the counters either side of it close up. The left end is buried inside
      // the ring, so the bar reads as flush on the right and joined on the left.
      bar(ox + 10, radius - crossbar / 2, 90, crossbar),
    ],
  };
}

function eye(ox: number): Glyph {
  const dot = 17;
  const cx = ox + weight / 2;
  return {
    advance: weight,
    shapes: [
      bar(ox, 0, weight, xHeight),
      {
        d:
          `M ${n(cx - dot)} ${n(-ascender + dot)} ` +
          `a ${dot} ${dot} 0 1 0 ${dot * 2} 0 a ${dot} ${dot} 0 1 0 ${-dot * 2} 0`,
      },
    ],
  };
}

const glyphs: Record<string, (ox: number) => Glyph> = { a: ay, d: dee, e: ee, i: eye, v: vee };

/**
 * Kerning. A `v` is mostly empty at the top and pointed at the bottom, so a flat
 * sidebearing leaves it visibly adrift from its neighbours even though the gap
 * is nominally the same as everywhere else. These pairs close that up.
 */
const kerning: Record<string, number> = {
  ad: -3,
  de: -3,
  dv: -14,
  ev: -16,
  va: -16,
  vd: -14,
  vi: -8,
};

type Word = { bottom: number; shapes: Shape[]; top: number; width: number };

/**
 * Lays a word out on the baseline, in a box whose left edge is x = 0. `top` and
 * `bottom` report where the ink actually reaches, which is what the callers
 * position it by.
 */
function setWord(text: string): Word {
  const shapes: Shape[] = [];
  let x = 0;
  let previous = "";
  for (const character of text) {
    const build = glyphs[character];
    if (build === undefined) throw new Error(`No letterform for "${character}".`);
    x += kerning[previous + character] ?? 0;
    const glyph = build(x);
    shapes.push(...glyph.shapes);
    x += glyph.advance + tracking;
    previous = character;
  }
  const width = x - tracking;

  // The dot of `i` occupies the same band as the ascender of `d`, and nothing
  // descends below the writing line.
  return { bottom: xHeight, shapes, top: -ascender, width };
}

// ---------------------------------------------------------------------------
// Bottles.
// ---------------------------------------------------------------------------

/**
 * One bottle, standing on `baseline`. Long neck, curved shoulder, straight body
 * with a flat foot — the silhouette the artwork repeats across the row.
 */
function bottle(x: number, baseline: number, bodyWidth: number, height: number): string {
  const neck = bodyWidth * 0.3;
  const lipWidth = neck * 1.16;
  const lipHeight = height * 0.038;
  const neckHeight = height * 0.3;
  const shoulder = height * 0.16;
  const cx = x + bodyWidth / 2;
  const top = baseline - height;
  const lipRadius = neck * 0.18;
  const footRadius = bodyWidth * 0.07;
  const shoulderTop = top + lipHeight + neckHeight;
  const shoulderEnd = shoulderTop + shoulder;

  return [
    `M ${n(cx - lipWidth / 2)} ${n(top + lipRadius)}`,
    `Q ${n(cx - lipWidth / 2)} ${n(top)} ${n(cx - lipWidth / 2 + lipRadius)} ${n(top)}`,
    `H ${n(cx + lipWidth / 2 - lipRadius)}`,
    `Q ${n(cx + lipWidth / 2)} ${n(top)} ${n(cx + lipWidth / 2)} ${n(top + lipRadius)}`,
    `V ${n(top + lipHeight)}`,
    `H ${n(cx + neck / 2)}`,
    `V ${n(shoulderTop)}`,
    `C ${n(cx + neck / 2)} ${n(shoulderTop + shoulder * 0.62)}` +
      ` ${n(cx + bodyWidth / 2)} ${n(shoulderTop + shoulder * 0.36)}` +
      ` ${n(cx + bodyWidth / 2)} ${n(shoulderEnd)}`,
    `V ${n(baseline - footRadius)}`,
    `Q ${n(cx + bodyWidth / 2)} ${n(baseline)} ${n(cx + bodyWidth / 2 - footRadius)} ${n(baseline)}`,
    `H ${n(cx - bodyWidth / 2 + footRadius)}`,
    `Q ${n(cx - bodyWidth / 2)} ${n(baseline)} ${n(cx - bodyWidth / 2)} ${n(baseline - footRadius)}`,
    `V ${n(shoulderEnd)}`,
    `C ${n(cx - bodyWidth / 2)} ${n(shoulderTop + shoulder * 0.36)}` +
      ` ${n(cx - neck / 2)} ${n(shoulderTop + shoulder * 0.62)}` +
      ` ${n(cx - neck / 2)} ${n(shoulderTop)}`,
    `V ${n(top + lipHeight)}`,
    `H ${n(cx - lipWidth / 2)}`,
    "Z",
  ].join(" ");
}

/** The uneven skyline of the artwork, as a fraction of the tallest bottle. */
const skyline = [0.9, 0.96, 0.85, 1, 0.77, 0.94, 0.81];

/** Left edge and total width of a row, for cropping and for tiling it. */
function rowSpan(): { span: number; start: number } {
  const step = lockupRow.bodyWidth * 0.92;
  const span = step * (skyline.length - 1) + lockupRow.bodyWidth;
  return { span, start: lockupRow.centre - span / 2 };
}

function bottlePaths(options: {
  baseline: number;
  bodyWidth: number;
  centre: number;
  tallest: number;
}): string[] {
  const { baseline, bodyWidth, centre, tallest } = options;
  const step = bodyWidth * 0.92;
  const total = step * (skyline.length - 1) + bodyWidth;
  const start = centre - total / 2;
  return skyline.map((fraction, index) =>
    bottle(start + index * step, baseline, bodyWidth, tallest * fraction),
  );
}

// ---------------------------------------------------------------------------
// Assembly.
// ---------------------------------------------------------------------------

const title = "Va de Vi";

function renderShapes(shapes: Shape[], fill: string, indent: string): string {
  return shapes
    .map((shape) =>
      shape.stroke === undefined
        ? `${indent}<path d="${shape.d}" fill="${fill}"/>`
        : `${indent}<path d="${shape.d}" fill="none" stroke="${fill}" stroke-width="${shape.stroke}"/>`,
    )
    .join("\n");
}

/**
 * Places a word by the line its ink rests on, and by its centre, scaled to a
 * target width. The final translate is what does the resting: the glyphs are
 * drawn below the origin, so without it the word hangs its own height too low.
 */
function placeWord(word: Word, centre: number, restsOn: number, width: number): string {
  const scale = width / word.width;
  return (
    `translate(${n(centre - width / 2)} ${n(restsOn)}) ` +
    `scale(${n(scale)}) translate(0 ${-word.bottom})`
  );
}

function renderBottles(paths: string[], tints: string[], indent: string): string {
  return paths
    .map((path, index) => `${indent}<path d="${path}" fill="${tints[index % tints.length]}"/>`)
    .join("\n");
}

/**
 * The lockup layout, in a 1200 x 900 box. The wordmark is deliberately narrower
 * than the bottle row so the `v` and the `i` sit inside it rather than hanging
 * off the ends, as they do in the source artwork.
 *
 * The wordmark rests on the same writing line as the bottles.
 */
const lockupRow = { baseline: 700, bodyWidth: 132, centre: 600, tallest: 520 } as const;
const lockupWord = { baseline: 700, centre: 600, width: 754 } as const;

function lockup(ground: string, ink: string, tints: string[]): string {
  const word = setWord("vadevi");
  const paths = bottlePaths(lockupRow);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-label="${title}">
  <title>${title}</title>
  <rect width="1200" height="900" fill="${ground}"/>
  <g>
${renderBottles(paths, tints, "    ")}
  </g>
  <g transform="${placeWord(word, lockupWord.centre, lockupWord.baseline, lockupWord.width)}">
${renderShapes(word.shapes, ink, "    ")}
  </g>
</svg>
`;
}

function icon(ground: string, ink: string, tints: string[], maskable: boolean): string {
  const word = setWord("vdv");
  const paths = bottlePaths({ baseline: 408, bodyWidth: 66, centre: 256, tallest: 312 });
  // A maskable icon must survive any crop, so its content sits inside the 80%
  // safe zone the specification guarantees, on a ground that reaches the edge.
  const scale = maskable ? 0.72 : 1;
  const ledge = maskable
    ? `  <rect width="512" height="512" fill="${ground}"/>`
    : `  <rect width="512" height="512" rx="114" ry="114" fill="${ground}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${title}">
  <title>${title}</title>
${ledge}
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <g>
${renderBottles(paths, tints, "      ")}
    </g>
    <g transform="${placeWord(word, 256, 432, 346)}">
${renderShapes(word.shapes, ink, "      ")}
    </g>
  </g>
</svg>
`;
}

/**
 * The in-application marks, as data rather than files, so the shell can paint
 * them in the current theme's colours instead of shipping one copy per theme.
 */
function marksModule(): string {
  const word = setWord("vadevi");
  const monogram = setWord("vdv");
  const paths = bottlePaths(lockupRow);
  const serialise = (shapes: Shape[]): string =>
    shapes
      .map((shape) =>
        shape.stroke === undefined
          ? `  { d: "${shape.d}" },`
          : `  { d: "${shape.d}", stroke: ${shape.stroke} },`,
      )
      .join("\n");

  return `/**
 * Generated by scripts/generate-brand.ts. Do not edit by hand.
 *
 * The letterforms and bottle silhouettes the application draws inline, so they
 * take the current theme's colours. The same geometry is written out as static
 * files for the installed icon, where no theme is available.
 */

/** A stroked shape carries its width; the rest are filled. */
export type BrandShape = { d: string; stroke?: number };

export const wordmarkBox = {
  height: ${n(word.bottom - word.top)},
  top: ${n(word.top)},
  width: ${n(word.width)},
} as const;

export const wordmarkShapes: readonly BrandShape[] = [
${serialise(word.shapes)}
];

export const monogramBox = {
  height: ${n(monogram.bottom - monogram.top)},
  top: ${n(monogram.top)},
  width: ${n(monogram.width)},
} as const;

export const monogramShapes: readonly BrandShape[] = [
${serialise(monogram.shapes)}
];

/** Seven bottles on a common baseline, in a 1200 x 900 box. */
export const bottleRow = {
  /** Left edge of the first bottle. */
  start: ${n(rowSpan().start)},
  /** Width of the whole row, which is also the pitch for repeating it. */
  span: ${n(rowSpan().span)},
} as const;

/** Where the wordmark sits over that row. */
export const lockupWordmark = {
  baseline: ${lockupWord.baseline},
  centre: ${lockupWord.centre},
  width: ${lockupWord.width},
} as const;

export const bottleRowPaths: readonly string[] = [
${paths.map((path) => `  "${path}",`).join("\n")}
];
`;
}

// ---------------------------------------------------------------------------

const root = resolve(import.meta.dirname, "..");

const outputs: [string, string][] = [
  ["apps/web/public/icon.svg", icon(wine, cream, bottlesOnWine, false)],
  ["apps/web/public/brand/icon-maskable.svg", icon(wineDeep, cream, bottlesOnWine, true)],
  ["apps/web/public/brand/icon-light.svg", icon(cream, wine, bottlesOnCream, false)],
  ["apps/web/public/brand/lockup-dark.svg", lockup(wine, cream, bottlesOnWine)],
  ["apps/web/public/brand/lockup-light.svg", lockup(cream, wine, bottlesOnCream)],
  ["apps/web/src/brand/marks.ts", marksModule()],
];

/**
 * `--check` fails when a committed asset no longer matches the description
 * above. Hand-editing one of these files is how the icon's two letterforms
 * drifted into a W: the file was plausible on its own and nobody re-rendered it.
 */
if (process.argv.includes("--check")) {
  const stale = outputs.filter(([path, contents]) => {
    try {
      return readFileSync(resolve(root, path), "utf8") !== contents;
    } catch {
      return true;
    }
  });
  if (stale.length > 0) {
    console.error(
      `Brand assets are out of date with scripts/generate-brand.ts:\n` +
        stale.map(([path]) => `  ${path}`).join("\n") +
        `\nRun \`pnpm brand:generate\` and commit the result.`,
    );
    process.exit(1);
  }
  console.info(`All ${outputs.length} brand assets match the generator.`);
} else {
  for (const [path, contents] of outputs) {
    const target = resolve(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents, "utf8");
    console.info(`wrote ${path}`);
  }
}
