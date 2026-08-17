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

/** Identify: a bottle held under a magnifier — looking closely at what it is. */
export function ReadLabelIcon() {
  return (
    <Frame>
      <path d="M10.0 6.3H11.0V8.73C11.0 9.46 12.0 9.46 12.0 9.95V13.89Q12.0 14.4 11.49 14.4H9.51Q9.0 14.4 9.0 13.89V9.95C9.0 9.46 10.0 9.46 10.0 8.73Z" />
      <circle cx="10.5" cy="10.5" r="7.2" />
      <path d="M15.6 15.6 20.9 20.9" />
    </Frame>
  );
}

/**
 * Cellar: three bottles standing together, in the artwork's own silhouette —
 * long neck, curved shoulder, straight body — at the skyline heights the
 * wordmark repeats.
 */
export function CellarIcon() {
  return (
    <Frame>
      <path d="M5.68 5.2H6.92V9.76C6.92 11.13 8.35 11.13 8.35 12.04V19.7Q8.35 20.4 7.65 20.4H4.95Q4.25 20.4 4.25 19.7V12.04C4.25 11.13 5.68 11.13 5.68 9.76Z" />
      <path d="M11.34 3.6H12.66V8.64C12.66 10.15 14.15 10.15 14.15 11.16V19.67Q14.15 20.4 13.42 20.4H10.58Q9.85 20.4 9.85 19.67V11.16C9.85 10.15 11.34 10.15 11.34 8.64Z" />
      <path d="M17.1 6.0H18.3V10.32C18.3 11.62 19.7 11.62 19.7 12.48V19.72Q19.7 20.4 19.02 20.4H16.38Q15.7 20.4 15.7 19.72V12.48C15.7 11.62 17.1 11.62 17.1 10.32Z" />
    </Frame>
  );
}

/**
 * Wishlist: a corkscrew, the vintage kind — a T-handle, a rounded frame, and a
 * helix — set on the diagonal it is actually held at. It is the bottle you mean
 * to open, once you have it.
 */
export function WishlistIcon() {
  return (
    <Frame>
      <g transform="rotate(-24 12 12)">
        <path d="M8.6 4H15.4" />
        <path d="M12 4V6" />
        <ellipse cx="12" cy="8.2" rx="2.9" ry="2.1" />
        <path d="M12 10.3V11.4" />
        <path d="M12 11.6q2.1 1.1 0 2.2 -2.1 1.1 0 2.2 2.1 1.1 0 2.2 -2.1 1.1 0 2.2" />
        <path d="M12 20V21" />
      </g>
    </Frame>
  );
}

/** Prices: a shopping bag with a bunch of grapes — what a bottle costs to buy. */
export function PriceIcon() {
  return (
    <Frame>
      <path d="M8.5 8.7 7.4 19.3a1.1 1.1 0 0 0 1.1 1.2H15.5a1.1 1.1 0 0 0 1.1-1.2L15.5 8.7Z" />
      <path d="M9.6 8.7v-.6a1.3 1.3 0 0 1 2.6 0v.6" />
      <path d="M11.8 8.7v-.6a1.3 1.3 0 0 1 2.6 0v.6" />
      <g fill="currentColor" stroke="none">
        <circle cx="10.7" cy="13.8" r="1.3" />
        <circle cx="13.3" cy="13.8" r="1.3" />
        <circle cx="12" cy="16.1" r="1.3" />
      </g>
    </Frame>
  );
}
