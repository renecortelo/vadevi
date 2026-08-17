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

/**
 * Home: the winery itself — a roof over a squared building, with a bunch inside
 * it. What is in a winery is wine, not joinery.
 */
export function WineryIcon() {
  return (
    <Frame>
      <path d="M4.4 9.6 12 3.4l7.6 6.2" />
      <path d="M6 9.6v10.9h12V9.6" />
      <path d="M3 20.5h18" />
      <g fill="currentColor" stroke="none">
        <circle cx="10.3" cy="13.3" r="1.5" />
        <circle cx="13.7" cy="13.3" r="1.5" />
        <circle cx="12" cy="16.4" r="1.5" />
      </g>
    </Frame>
  );
}

/**
 * About: a barrel seen from the side, with a small bunch on its face — the
 * cellar's own mark, which is what an "about this" screen is.
 */
export function BarrelIcon() {
  return (
    <Frame>
      <path d="M8.2 3.6h7.6c1.7 2.3 2.5 5 2.5 8.4s-.8 6.1-2.5 8.4H8.2c-1.7-2.3-2.5-5-2.5-8.4s.8-6.1 2.5-8.4z" />
      <path d="M5.9 8h12.2" />
      <path d="M5.9 16h12.2" />
      <g fill="currentColor" stroke="none">
        <circle cx="10.6" cy="10.6" r="1.15" />
        <circle cx="13.4" cy="10.6" r="1.15" />
        <circle cx="9.2" cy="12.9" r="1.15" />
        <circle cx="12" cy="12.9" r="1.15" />
        <circle cx="14.8" cy="12.9" r="1.15" />
        <circle cx="12" cy="15.2" r="1.15" />
      </g>
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
 * Memory: a notebook — the rules run out past the spine, which is what stops a
 * rectangle reading as a cabinet — with a glass on the page.
 */
export function CrateIcon() {
  return (
    <Frame>
      <path d="M6.2 3.4h13.4v17.2H6.2z" />
      <path d="M3.4 7.8h5.6" />
      <path d="M3.4 12h5.6" />
      <path d="M3.4 16.2h5.6" />
      <path d="M11.2 7.6h5.6l-.5 3.4a2.3 2.3 0 0 1-4.6 0z" />
      <path d="M14 13.3v3" />
      <path d="M12.2 16.6h3.6" />
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
  [8.9, 9.2],
  [12.5, 9.2],
  [7.1, 12.6],
  [10.7, 12.6],
  [14.3, 12.6],
  [8.9, 16],
  [12.5, 16],
  [10.7, 19.4],
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
      {/* The stalk the bunch hangs from. */}
      <path d="M12.4 3.4v3" />
      <g fill="currentColor" stroke="none">
        {bunch.map(([cx, cy]) => (
          <circle cx={cx} cy={cy} key={`${cx}-${cy}`} r="1.8" />
        ))}
        {/* Where a leaf would be. He proposes; that is the whole of him. */}
        <path d={spark(16.9, 5.5, 2.6)} />
      </g>
    </Frame>
  );
}

/** Identify: a label under a lens — reading what is on the bottle. */
export function ReadLabelIcon() {
  return (
    <Frame>
      <path d="M8.4 2.8h7.2v11.4a3.6 3.6 0 0 1-7.2 0z" />
      <path d="M8.4 6.4h7.2" />
      <circle cx="13.9" cy="15.9" r="4.3" />
      <path d="M17 19 20.6 22.6" />
    </Frame>
  );
}

/** Wishlist: a bottle you do not have yet, marked to remember. */
export function WishlistIcon() {
  return (
    <Frame>
      <path d="M9.6 2.9h3.6v3.4l1.7 2.6v10.9a1.2 1.2 0 0 1-1.2 1.2H9.1a1.2 1.2 0 0 1-1.2-1.2V8.9l1.7-2.6z" />
      <path d="M17.6 3.2v5.6l2.4-1.6 2.4 1.6V3.2z" />
    </Frame>
  );
}

/** Prices: what a bottle costs, over time. */
export function PriceIcon() {
  return (
    <Frame>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M14.6 8.9a2.9 2.9 0 0 0-2.6-1.4c-1.7 0-2.8.9-2.8 2.1 0 3 5.6 1.6 5.6 4.6 0 1.3-1.2 2.3-3 2.3a3.1 3.1 0 0 1-2.8-1.5" />
      <path d="M12 5.6v12.8" />
    </Frame>
  );
}
