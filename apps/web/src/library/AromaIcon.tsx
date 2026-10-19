import type { AromaDescriptor, AromaFamilyId } from "@vadevi/i18n/runtime";

/**
 * Line drawings for the aroma vocabulary, drawn for Va de Vi on a 48-unit
 * grid with one stroke weight. Most aromas have no drawing of their own: they
 * take their group's, or their family's — a wheel of 120 small pictures
 * would be a crowd, and a family's picture says enough there.
 */
type Drawing = readonly string[];

const apple: Drawing = [
  "M24 14c-6-4-14 0-14 9 0 9 6 15 10 15 2 0 3-1 4-1s2 1 4 1c4 0 10-6 10-15 0-9-8-13-14-9z",
  "M24 14c0-3 1-6 4-8",
  "M26 10c3-2 7-1 8 1-3 2-6 2-8-1z",
];
const flower: Drawing = [
  "M24 26a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  "M24 18c-4-3-4-9 0-10 4 1 4 7 0 10z",
  "M28 21c3-4 9-4 10 0-1 4-7 4-10 0z",
  "M27 26c4 2 5 8 1 10-4 0-5-6-1-10z",
  "M21 26c-4 2-5 8-1 10 4 0 5-6 1-10z",
  "M20 21c-3-4-9-4-10 0 1 4 7 4 10 0z",
  "M24 30v12",
];
const sprig: Drawing = [
  "M14 40c6-8 12-16 22-28",
  "M20 32c-5 0-8-3-8-7 4 0 7 3 8 7z",
  "M25 25c-5-1-7-4-7-8 4 1 6 4 7 8z",
  "M23 31c1-5 4-7 8-7 0 4-3 7-8 7z",
  "M29 23c1-5 4-7 7-7 0 4-3 7-7 7z",
];
const starAnise: Drawing = [
  "M24 8l4 10 10-4-4 10 10 4-10 4 4 10-10-4-4 10-4-10-10 4 4-10-10-4 10-4-4-10 10 4z",
  "M24 27a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
];
const rocks: Drawing = ["M6 38l6-10 9 2 4 8z", "M22 38l7-13 9 3 4 10z", "M4 38h40"];
const barrel: Drawing = [
  "M15 9h18c3 9 3 21 0 30H15c-3-9-3-21 0-30z",
  "M13 17h22M13 31h22",
  "M24 9v30",
];
const acorn: Drawing = [
  "M12 20c0-6 5-9 12-9s12 3 12 9z",
  "M14 20c0 10 4 18 10 21 6-3 10-11 10-21",
  "M24 11V6",
];
const honeyJar: Drawing = [
  "M14 17h20v19a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4z",
  "M12 12h24v5H12z",
  "M22 17v6a2 2 0 0 0 4 0v-3",
];
const hide: Drawing = [
  "M12 10c4 2 8 2 12 0 4 2 8 2 12 0-2 6 2 10 0 14 2 4-2 8 0 14-4-2-8-2-12 0-4 2-8 2-12 0 2-6-2-10 0-14-2-4 2-8 0-14z",
  "M18 18h12M18 24h12M18 30h12",
];
const cherries: Drawing = [
  "M17 38a6 6 0 1 0 0-12 6 6 0 0 0 0 12z",
  "M31 36a6 6 0 1 0 0-12 6 6 0 0 0 0 12z",
  "M17 26c2-8 6-14 11-17M31 24c-1-6-2-11-3-15",
  "M28 9c3-2 7-1 8 1-3 2-6 2-8-1z",
];
const blackberry: Drawing = [
  "M20 23a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM28 23a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  "M16 30a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM24 30a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM32 30a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  "M20 37a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM28 37a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  "M24 16l-4-6M24 16l4-6M24 16V8",
];
const citrusSlice: Drawing = [
  "M24 38a14 14 0 1 0 0-28 14 14 0 0 0 0 28z",
  "M24 34a10 10 0 1 0 0-20 10 10 0 0 0 0 20z",
  "M24 14v20M14 24h20M17 17l14 14M31 17L17 31",
];
const pear: Drawing = [
  "M24 10c-3 0-4 3-4 7 0 4-6 7-6 14 0 6 5 10 10 10s10-4 10-10c0-7-6-10-6-14 0-4-1-7-4-7z",
  "M24 10V5",
  "M24 7c2-2 5-2 7 0",
];
const peach: Drawing = [
  "M24 14c-7-3-15 2-15 11s7 15 15 15 15-6 15-15-8-14-15-11z",
  "M24 14c-3 6-3 15 0 26",
  "M24 14c2-4 6-6 10-5-2 4-6 6-10 5z",
];
const pineapple: Drawing = [
  "M16 28c0-6 4-10 8-10s8 4 8 10-2 14-8 14-8-8-8-14z",
  "M18 24l12 12M30 24L18 36",
  "M24 18l-4-9M24 18V6M24 18l4-9M24 18l-8-4M24 18l8-4",
];
const raisin: Drawing = [
  "M14 25c0-7 5-12 10-12s10 5 10 12-4 14-10 14-10-7-10-14z",
  "M19 21c3 2 7 2 10 0M18 27c4 2 8 2 12 0M20 33c3 1 5 1 8 0",
];
const grapes: Drawing = [
  "M16 22a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM24 22a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM32 22a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  "M20 29a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM28 29a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  "M24 36a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  "M24 14V8M24 9c3-2 6-2 8 0",
];
const bellPepper: Drawing = [
  "M16 18c-4 6-3 18 4 21 2 1 3-1 4-1s2 2 4 1c7-3 8-15 4-21-2-3-6-3-8-1-2-2-6-2-8 1z",
  "M19 16c3 2 7 2 10 0",
  "M24 17c0-4 2-7 5-8",
  "M24 23v12",
];
const crystal: Drawing = ["M24 6l10 12-10 24-10-24z", "M14 18h20", "M24 6l-4 12 4 24 4-24z"];
const smoke: Drawing = ["M18 40c-4-6 4-10 0-16s4-10 0-16", "M28 40c-4-6 4-10 0-16s4-10 0-16"];
const saltShaker: Drawing = ["M17 18h14l2 22H15z", "M18 10h12l1 8H17z", "M22 13h.1M26 13h.1"];

const byFamily: Record<AromaFamilyId, Drawing> = {
  earth: rocks,
  floral: flower,
  fruit: apple,
  herbal: sprig,
  nut: acorn,
  oak: barrel,
  savoury: hide,
  spice: starAnise,
  sweet: honeyJar,
};

const byGroup: Record<string, Drawing> = {
  earth_mineral: crystal,
  fruit_black: blackberry,
  fruit_citrus: citrusSlice,
  fruit_dried: raisin,
  fruit_orchard: pear,
  fruit_other: grapes,
  fruit_red: cherries,
  fruit_stone: peach,
  fruit_tropical: pineapple,
  herbal_vegetal: bellPepper,
  oak_toast: smoke,
  savoury_savoury: saltShaker,
};

const peppercorns: Drawing = [
  "M16 23a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM30 21a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
  "M22 35a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM34 36a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
];

const byCode: Record<string, Drawing> = {
  "fruit.orchard.apple": apple,
  "fruit.orchard.green_apple": apple,
  "fruit.red.raspberry": [
    "M18 25a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM28 25a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
    "M23 34a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM14 34a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM32 34a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
    "M23 15c0-4 3-6 6-7",
  ],
  "fruit.red.strawberry": [
    "M24 42c-9-6-14-14-12-21 2-6 8-7 12-5 4-2 10-1 12 5 2 7-3 15-12 21z",
    "M17 12l7 4 7-4M24 16V8",
    "M19 24h.1M27 23h.1M23 31h.1M30 30h.1M18 32h.1",
  ],
  "fruit.black.plum": [
    "M24 12c-8 0-13 7-13 15s6 13 13 13 13-5 13-13-5-15-13-15z",
    "M24 12c3 8 3 18-1 28",
    "M24 12c0-3 1-5 3-7",
  ],
  "fruit.citrus.lemon": [
    "M10 24c0-8 7-13 14-13s14 5 14 13-7 13-14 13-14-5-14-13z",
    "M10 24H6M38 24h4",
  ],
  "floral.rose": [
    "M24 22c3 0 4-3 2-5-3-2-8 0-8 5 0 6 7 9 12 6 6-3 6-12 1-16",
    "M14 18c-4 6-2 16 8 18 9 2 15-5 13-13",
    "M24 36v8",
  ],
  "herbal.mint": [
    "M24 42V22",
    "M24 22c-8 0-12-6-12-12 8 0 12 5 12 12z",
    "M24 28c8 0 12-6 12-12-8 0-12 5-12 12z",
  ],
  "spice.black_pepper": peppercorns,
  "spice.white_pepper": peppercorns,
  "mineral.tar": ["M24 8c6 10 11 16 11 23a11 11 0 0 1-22 0c0-7 5-13 11-23z", "M19 32c1 3 3 5 6 5"],
  "production.oak.vanilla": [
    "M12 40C20 30 28 18 34 8",
    "M16 42C24 32 32 20 38 10",
    "M34 8l4 2M12 40l4 2",
  ],
  "production.toast.coffee": [
    "M24 8c8 0 12 7 12 16s-4 16-12 16-12-7-12-16S16 8 24 8z",
    "M24 8c-4 6 4 12 0 16s4 10 0 16",
  ],
  "production.toast.tobacco": [
    "M24 6c10 6 14 18 0 36C10 24 14 12 24 6z",
    "M24 10v30M24 18l-5-4M24 18l5-4M24 26l-6-4M24 26l6-4",
  ],
  "nut.almond": [
    "M24 8c7 6 10 14 10 20 0 8-5 12-10 12s-10-4-10-12c0-6 3-14 10-20z",
    "M24 14c-2 6-2 14 0 22",
  ],
  "sweet.honey": ["M24 8l12 7v14l-12 7-12-7V15z", "M24 15l6 3.5v7L24 29l-6-3.5v-7z"],
  "sweet.chocolate": ["M12 10h24v28H12z", "M12 19h24M12 28h24M24 10v28"],
};

function drawingFor(descriptor: AromaDescriptor): Drawing {
  return byCode[descriptor.code] ?? byGroup[descriptor.group] ?? byFamily[descriptor.family];
}

export function AromaIcon({ descriptor }: { descriptor: AromaDescriptor }) {
  return (
    <svg aria-hidden="true" className="aroma-icon" focusable="false" viewBox="0 0 48 48">
      {drawingFor(descriptor).map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}

/** A family's own drawing, for the wheel's sectors. */
export function AromaFamilyIcon({ family }: { family: AromaFamilyId }) {
  return (
    <svg aria-hidden="true" className="aroma-icon" focusable="false" viewBox="0 0 48 48">
      {byFamily[family].map((path) => (
        <path d={path} key={path} />
      ))}
    </svg>
  );
}
