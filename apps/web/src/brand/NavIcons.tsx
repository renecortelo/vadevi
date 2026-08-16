/**
 * The navigation icons.
 *
 * They were typographic characters — ⌂, +, ◇, ▦, ✦ — which render in whatever
 * the system font decides, at whatever weight it decides, and say nothing about
 * wine. These are drawn instead: one set, one stroke weight, one 24-unit grid,
 * so the rail reads as a family rather than as five borrowed symbols.
 *
 * Each is decorative; the link's own text names the destination.
 */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.5,
} as const;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg aria-hidden="true" className="nav-icon" focusable="false" viewBox="0 0 24 24" {...stroke}>
      {children}
    </svg>
  );
}

/**
 * A wine glass: a bowl that curves in towards the stem rather than a trapezoid,
 * which is the difference between a wine glass and a tumbler. Drawn once and
 * placed twice, so the two icons that use it cannot drift apart.
 */
function Glass({ transform }: { transform: string }) {
  return (
    <g transform={transform}>
      <path d="M-3.7 0h7.4c0 4.2-1.66 7.2-3.7 7.2S-3.7 4.2-3.7 0z" />
      <path d="M0 7.2v4.9" />
      <path d="M-2.7 13.2q2.7 1.1 5.4 0" />
    </g>
  );
}

/**
 * Home: three barrels stacked head-on, the way a cellar stacks them — two
 * below, one nested in the notch between. Each head carries the vertical stave
 * band and its bung, which is what stops a circle from reading as a coin.
 */
export function BarrelsIcon() {
  const barrel = (cx: number, cy: number) => (
    <g key={`${cx}-${cy}`}>
      <circle cx={cx} cy={cy} r="4.2" />
      <path d={`M${cx - 1.35} ${cy - 3.98}v7.96`} />
      <path d={`M${cx + 1.35} ${cy - 3.98}v7.96`} />
      <circle cx={cx} cy={cy} fill="currentColor" r="0.6" stroke="none" />
    </g>
  );
  return (
    <Frame>
      {barrel(12, 8.3)}
      {barrel(7.6, 15.4)}
      {barrel(16.4, 15.4)}
    </Frame>
  );
}

/** Log: a glass, and something being added to it. */
export function PourIcon() {
  return (
    <Frame>
      <Glass transform="translate(9 4.2)" />
      <path d="M18.6 4.2v5.4" />
      <path d="M15.9 6.9h5.4" />
    </Frame>
  );
}

/** Sessions: two glasses meeting, which is what a shared tasting is. */
export function ToastIcon() {
  return (
    <Frame>
      <Glass transform="translate(7 7.4) rotate(-13) scale(0.86)" />
      <Glass transform="translate(17 7.4) rotate(13) scale(0.86)" />
      <path d="M12 4.5V2.7" />
      <path d="M9.2 5.2 8.4 3.6" />
      <path d="M14.8 5.2 15.6 3.6" />
    </Frame>
  );
}

/** Memory: the bottles you have kept, in the crate you keep them in. */
export function CrateIcon() {
  const bottle = (cx: number) => (
    <path d={`M${cx - 0.95} 4.2h1.9v2.4l1 1.5v3.5M${cx - 1.95} 11.6V8.1l1-1.5`} key={cx} />
  );
  return (
    <Frame>
      {bottle(6.9)}
      {bottle(12)}
      {bottle(17.1)}
      <path d="M3.3 11.6h17.4v8.5H3.3z" />
      <path d="M3.3 14.4h17.4" />
      <path d="M3.3 17.2h17.4" />
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

/**
 * Vicenç: a bunch of grapes with one grape replaced by a spark. He reads labels
 * and proposes; the grape that is not a grape is the whole of what he is.
 *
 * The leaf sits to the left of the stem so the spark has the top-right corner to
 * itself — together they merged into one unreadable shape.
 */
export function GrapesIcon() {
  return (
    <Frame>
      <path d="M10.6 4.4v2.9" />
      <path d="M10.4 5.5c-1.6-1.3-3.1-.9-3.6 0 1.1 1.2 2.7 1.1 3.6 0z" />
      <g fill="currentColor" stroke="none">
        <circle cx="9" cy="11" r="1.55" />
        <circle cx="7.4" cy="14" r="1.55" />
        <circle cx="10.6" cy="14" r="1.55" />
        <circle cx="13.8" cy="14" r="1.55" />
        <circle cx="9" cy="17" r="1.55" />
        <circle cx="12.2" cy="17" r="1.55" />
        <path d={spark(12.2, 11, 2.3)} />
      </g>
    </Frame>
  );
}
