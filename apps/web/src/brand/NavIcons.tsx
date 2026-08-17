/**
 * The navigation icons.
 *
 * They were typographic characters — ⌂, +, ◇, ▦, ✦ — which render in whatever
 * the system font decides, at whatever weight it decides, and say nothing about
 * wine. These are drawn instead: one set, one stroke weight, one 24-unit grid,
 * so the rail reads as a family rather than as six borrowed symbols.
 *
 * Each is decorative; the link's own text names the destination.
 */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.4,
} as const;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg aria-hidden="true" className="nav-icon" focusable="false" viewBox="0 0 24 24" {...stroke}>
      {children}
    </svg>
  );
}

/**
 * A wine glass: a balloon bowl with the wine still in it, a stem, and a foot
 * that curves. Drawn once and placed twice, so the icons that use it cannot
 * drift apart.
 */
function Glass({ transform }: { transform: string }) {
  return (
    <g transform={transform}>
      <path d="M-4.1 0h8.2c0 3.9-1.84 6.7-4.1 6.7S-4.1 3.9-4.1 0z" />
      <path d="M-3.5 2.5c1.17.85 2.33.85 3.5 0s2.33-.85 3.5 0" />
      <path d="M0 6.7v4.5" />
      <path d="M-3 12.5q3 1.2 6 0" />
    </g>
  );
}

/** One barrel head. The stave band and its bung stop a circle reading as a coin. */
function BarrelHead({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const band = r * 0.32;
  const chord = Math.round(Math.sqrt(r * r - band * band) * 100) / 100;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} />
      <path d={`M${cx - band} ${cy - chord}V${cy + chord}`} />
      <path d={`M${cx + band} ${cy - chord}V${cy + chord}`} />
      <circle cx={cx} cy={cy} fill="currentColor" r={r * 0.14} stroke="none" />
    </g>
  );
}

/**
 * Home: three barrels stacked head-on, two below on their chocks and one nested
 * in the notch between them — the way a cellar actually stacks them.
 */
export function BarrelsIcon() {
  const chock = (cx: number) => `M${cx - 2.2} 21.2l.9-1.9h2.6l.9 1.9z`;
  return (
    <Frame>
      <BarrelHead cx={12} cy={7.4} r={4.15} />
      <BarrelHead cx={7.6} cy={14.9} r={4.15} />
      <BarrelHead cx={16.4} cy={14.9} r={4.15} />
      <path d={chock(7.6)} />
      <path d={chock(16.4)} />
    </Frame>
  );
}

/** About: a single barrel from the side, hoops and staves and all. */
export function BarrelIcon() {
  return (
    <Frame>
      <path d="M8.1 3.7h7.8c1.75 2.3 2.6 5 2.6 8.3s-.85 6-2.6 8.3H8.1c-1.75-2.3-2.6-5-2.6-8.3s.85-6 2.6-8.3z" />
      <path d="M5.9 8.3h12.2" />
      <path d="M5.9 15.7h12.2" />
      <path d="M10.6 3.7v16.6" />
      <path d="M13.4 3.7v16.6" />
    </Frame>
  );
}

/** Log: a glass, and something being added to it. */
export function PourIcon() {
  return (
    <Frame>
      <Glass transform="translate(8.4 2.9) scale(1.24)" />
      <path d="M18.8 4.4v5.2" />
      <path d="M16.2 7h5.2" />
    </Frame>
  );
}

/**
 * Sessions: two glasses meeting, which is what a shared tasting is.
 *
 * Each leans about its own foot rather than its rim. Leaning about the rim
 * swung the feet inwards until they crossed and the pair read as one shape;
 * about the foot, the feet stay planted and only the rims come together, which
 * is what a toast actually looks like.
 */
export function ToastIcon() {
  const lean = (footX: number, degrees: number) =>
    `translate(${footX} 20.2) rotate(${degrees}) scale(1.05) translate(0 -12.5)`;
  return (
    <Frame>
      <Glass transform={lean(6.6, 9)} />
      <Glass transform={lean(17.4, -9)} />
      <path d="M12 4.2V2.4" />
      <path d="M9.1 4.9 8.3 3.3" />
      <path d="M14.9 4.9 15.7 3.3" />
    </Frame>
  );
}

/**
 * Memory: the bottles you have kept, in the crate you keep them in. A long
 * narrow neck with a capsule band and a defined shoulder — the first attempt
 * had a short wide neck, which is the silhouette of a soap dispenser.
 */
export function CrateIcon() {
  const bottle = (cx: number) => (
    <path
      d={
        `M${cx - 0.8} 2.5h1.6v4.1l1.35 1.9v2.7` +
        `M${cx - 2.15} 11.2V8.5l1.35-1.9` +
        // The capsule band: the line that says wine rather than shampoo.
        `M${cx - 0.8} 4.2h1.6`
      }
      key={cx}
    />
  );
  return (
    <Frame>
      {bottle(6.8)}
      {bottle(12)}
      {bottle(17.2)}
      <path d="M3.1 11.2h17.8v9.2H3.1z" />
      <path d="M3.1 14.3h17.8" />
      <path d="M3.1 17.3h17.8" />
    </Frame>
  );
}

/**
 * A four-pointed spark with concave sides — the shape that reads as "this was
 * suggested, not typed".
 */
function spark(cx: number, cy: number, r: number): string {
  const near = r * 0.2;
  const far = r * 0.28;
  return (
    `M${cx} ${cy - r}` +
    `C${cx + near} ${cy - far} ${cx + far} ${cy - near} ${cx + r} ${cy}` +
    `C${cx + far} ${cy + near} ${cx + near} ${cy + far} ${cx} ${cy + r}` +
    `C${cx - near} ${cy + far} ${cx - far} ${cy + near} ${cx - r} ${cy}` +
    `C${cx - far} ${cy - near} ${cx - near} ${cy - far} ${cx} ${cy - r}Z`
  );
}

/** Grape positions, row by row, in the bunch Vicenç carries. */
const bunch = [
  [11.9, 8],
  [15.5, 8],
  [6.5, 11.6],
  [10.1, 11.6],
  [13.7, 11.6],
  [17.3, 11.6],
  [8.3, 15.2],
  [11.9, 15.2],
  [15.5, 15.2],
  [10.1, 18.8],
  [13.7, 18.8],
] as const;

/**
 * Vicenç: a bunch of grapes with a spark where one of them would be. He reads
 * labels and proposes; the grape that is not a grape is the whole of what he is,
 * so it is kept clear of its neighbours — set among them it merged into the
 * bunch and disappeared. No leaf and no stem: they crowded the box and left both
 * the grapes and the spark smaller than they wanted to be.
 */
export function GrapesIcon() {
  return (
    <Frame>
      <g fill="currentColor" stroke="none">
        {bunch.map(([cx, cy]) => (
          <circle cx={cx} cy={cy} key={`${cx}-${cy}`} r="1.8" />
        ))}
        <path d={spark(6.6, 6.8, 2.7)} />
      </g>
    </Frame>
  );
}
